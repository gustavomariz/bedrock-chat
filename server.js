// server.js
const express = require('express');
const cors = require('cors');
const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve arquivos estáticos

// ===== CONFIGURE SUAS CREDENCIAIS AQUI =====
const AWS_CONFIG = {
    region: 'us-east-1', // Sua região
    credentials: {
        accessKeyId: 'ASIAWVT2XSLHKOQBLFEP',
        secretAccessKey: '74mEkv61VO18ra5oqPeFJtlWaMLrvrpjdbHoUqbI'
    }
};

const BEDROCK_CONFIG = {
    agentId: 'GIA7IRICUU',
    aliases: {
        'basic': {
            id: '0Y1BC46TJK',
            name: 'Básico',
            description: 'Sem RAG e sem Guardrails'
        },
        'rag': {
            id: 'EEDBSWRCYM',
            name: 'Com RAG',
            description: 'Com busca em documentos'
        },
        'full': {
            id: 'UUNOWGTBXM',
            name: 'Completo',
            description: 'Com RAG e Guardrails'
        }
    }
};
// ============================================

const client = new BedrockAgentRuntimeClient(AWS_CONFIG);

// Armazenar sessões em memória (para produção, use Redis ou DB)
const sessions = new Map();

// Rota para servir o frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para obter aliases disponíveis
app.get('/api/aliases', (req, res) => {
    res.json({
        success: true,
        aliases: BEDROCK_CONFIG.aliases
    });
});

// Rota para enviar mensagem ao agente
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId, aliasType = 'basic' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        // Verificar se o alias existe
        if (!BEDROCK_CONFIG.aliases[aliasType]) {
            return res.status(400).json({ error: 'Alias inválido' });
        }

        const selectedAlias = BEDROCK_CONFIG.aliases[aliasType];
        const command = new InvokeAgentCommand({
            agentId: BEDROCK_CONFIG.agentId,
            agentAliasId: selectedAlias.id,
            sessionId: sessionId || `session-${Date.now()}`,
            inputText: message
        });

        console.log(`Usando alias: ${selectedAlias.name} (${selectedAlias.id})`);
        const response = await client.send(command);
        
        // Processar a resposta do streaming
        let responseText = '';
        if (response.completion) {
            for await (const chunk of response.completion) {
                if (chunk.chunk && chunk.chunk.bytes) {
                    const decoder = new TextDecoder();
                    responseText += decoder.decode(chunk.chunk.bytes);
                }
            }
        }

        res.json({
            success: true,
            response: responseText || 'Desculpe, não consegui processar sua mensagem.',
            sessionId: sessionId || `session-${Date.now()}`,
            aliasUsed: selectedAlias.name
        });

    } catch (error) {
        console.error('Erro no chat:', error);
        
        let errorMessage = 'Erro interno do servidor';
        if (error.name === 'AccessDeniedException') {
            errorMessage = 'Erro de autenticação AWS';
        } else if (error.name === 'ResourceNotFoundException') {
            errorMessage = 'Agente ou alias não encontrado';
        } else if (error.name === 'ValidationException') {
            errorMessage = 'Dados inválidos enviados';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Rota de health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        aliases: Object.keys(BEDROCK_CONFIG.aliases).length
    });
});

// Middleware para log de requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Configurar para aceitar conexões externas
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Importante: bind em todas as interfaces

app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${PORT}`);
    console.log(`Aliases configurados: ${Object.keys(BEDROCK_CONFIG.aliases).join(', ')}`);
    console.log(`Para acesso externo, use o IP público da instância na porta ${PORT}`);
});

module.exports = app;
