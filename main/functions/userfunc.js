// functions/userfunc.js

const db = require('../db/consql.js');
const cloudinary = require('../db/cloud.js');

/**
 * @description Realiza o login de um usuário comum.
 */
async function loginUser(req, res) {
    const { login, password } = req.body;
    const query = 'SELECT id, nome FROM usuarios WHERE email = $1 AND senha = $2';

    try {
        const result = await db.query(query, [login, password]);

        if (result.rows.length === 0) {
            return res.status(404).send({ error: 'Usuário ou senha inválidos.' });
        }

        const user = result.rows[0];
        
        // Inicia a sessão do usuário
        req.session.user = {
            id: user.id,
            name: user.nome,
            adm: false // Garante que é um usuário comum
        };

        res.redirect('/');

    } catch (err) {
        console.error('Erro no login do usuário:', err);
        res.status(500).send({ error: 'Erro interno do servidor.' });
    }
}


/**
 * @description Registra um novo usuário com endereço e foto de perfil.
 */
async function registerUser(req, res) {
    const { name, dt_birth, cpf, phone, email, password, cep, logradouro, numero, bairro, cidade, estado } = req.body;
    const photo = req.files?.photo_user;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
    }
    if (photo && !photo.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'O arquivo enviado não é uma imagem válida.' });
    }

    try {
        // Inicia transação para garantir consistência
        await db.query('BEGIN');

        // 1. Insere o endereço e obtém o ID
        const endQuery = `
            INSERT INTO enderecos (cep, logradouro, numero, bairro, cidade, estado)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `;
        const endResult = await db.query(endQuery, [cep, logradouro, numero, bairro, cidade, estado]);
        const enderecoId = endResult.rows[0].id;

        // 2. Insere o usuário com a referência ao endereço
        const userQuery = `
            INSERT INTO usuarios (nome, dt_nascimento, cpf, telefone, email, senha, endereco_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        const userResult = await db.query(userQuery, [name, dt_birth, cpf, phone, email, password, enderecoId]);
        const userId = userResult.rows[0].id;

        // 3. Faz o upload da foto do usuário, se existir
        if (photo) {
            await cloudinary.uploader.upload(photo.tempFilePath, {
                folder: 'users',
                public_id: `user_${userId}`,
                tags: [`user_${userId}`],
                resource_type: 'image',
                timeout: 120000
            });
        }
        
        // 4. Confirma a transação se tudo deu certo
        await db.query('COMMIT');
        
        res.redirect('/login');

    } catch (err) {
        // 5. Desfaz tudo se qualquer passo falhar
        await db.query('ROLLBACK');
        console.error('Erro ao registrar usuário:', err);
        return res.status(500).json({ error: 'Erro interno no processamento do registro.' });
    }
}


/**
 * @description Exibe a página de perfil do usuário logado.
 */
async function showProfile(req, res) {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const query = 'SELECT * FROM usuarios WHERE id = $1';

    try {
        const result = await db.query(query, [userId]);
        if (result.rows.length === 0) {
            return res.status(404).send({ error: 'Usuário não encontrado.' });
        }

        const user = result.rows[0];

        // Gera a URL da imagem de perfil (circular) a partir do Cloudinary
        const publicId = `users/user_${user.id}`;
        user.photo = cloudinary.url(publicId, {
            width: 150,
            height: 150,
            gravity: "face",
            crop: "thumb",
            radius: "max",
            fetch_format: "auto", // Otimiza o formato da imagem
            quality: "auto"     // Otimiza a qualidade
        });

        res.render('user/profile', { user });

    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        return res.status(500).send({ error: 'Erro ao carregar o perfil.' });
    }
}


/**
 * @description Encerra a sessão do usuário.
 */
function logoutUser(req, res) {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao encerrar a sessão:', err);
            return res.status(500).send('Erro ao encerrar a sessão');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
}


// Exporta todas as funções para serem usadas no server.js
module.exports = {
    loginUser,
    registerUser,
    showProfile,
    logoutUser
};