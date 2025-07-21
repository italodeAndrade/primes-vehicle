const  db = require('../db/consql.js');
const cloudinary = require('../db/cloud.js');
const { json } = require('express');

// Login Admin
async function loginAdmin(req, res) {
    const { login, password } = req.body;
    const query = 'SELECT * FROM adm WHERE log = $1 AND senha = $2';
    
    try {
        const result = await db.query(query, [login, password]);
        
        if (result.rows.length === 0) {
            return res.status(401).send({ error: 'Credenciais inválidas' });
        }
        
        req.session.user = {
            id: result.rows[0].id,
            name: result.rows[0].login,
            adm: true
        };
        
        res.redirect('/admin');
    } catch (err) {
        console.error('Erro no login admin:', err);
        res.status(500).send({ error: 'Erro no servidor' });
    }
}

// Carregar Usuários
async function loadUsers(req, res) {
    const query = `
        SELECT 
            u.id, 
            u.nome, 
            u.telefone, 
            u.email, 
            u.cpf, 
            e.*, 
            u.criado, 
            u.atualizado
        FROM usuarios u
        LEFT JOIN enderecos e ON u.endereco_id = e.id`;

    try {
        const results = await db.query(query);
        const users = results.rows;

        const formattedUsers = await Promise.all(users.map(async user => {
            try {
                const cloudinaryResponse = await cloudinary.api.resources_by_tag(`user_${user.id}`, { 
                    max_results: 1 
                });
                
                return {
                    ...user,
                    images: cloudinaryResponse.resources?.map(r => r.secure_url) || []
                };
            } catch (error) {
                console.error(`Erro buscando imagens do usuário ${user.id}:`, error);
                return { ...user, images: [] };
            }
        }));

        res.json(formattedUsers);
    } catch (err) {
        console.error('Erro ao buscar usuários:', err);
        res.status(500).send('Erro ao buscar usuários');
    }
}

// Deletar Usuário
async function deleteUser(req, res) {
    const { id } = req.params;
    
    try {
        // Deletar usuário
        await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
        
        // Deletar imagens no Cloudinary
        await cloudinary.api.delete_resources_by_tag(`user_${id}`);
        
        res.sendStatus(204);
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).send({ error: 'Erro ao deletar usuário' });
    }
}

// Deletar Carro
async function deleteCar(req, res) {
    const { id } = req.params;
    
    try {
        // Buscar dados do carro
        const carQuery = `
            SELECT 
                m.nome AS marca,
                md.nome AS modelo 
            FROM carros c
            JOIN modelos md ON c.modelo_id = md.id
            JOIN marcas m ON md.marca_id = m.id
            WHERE c.id = $1`;
        
        const carResult = await db.query(carQuery, [id]);
        
        if (carResult.rows.length === 0) {
            return res.status(404).send('Carro não encontrado');
        }
        
        // Deletar carro
        await db.query('DELETE FROM carros WHERE id = $1', [id]);
        
        // Deletar imagens no Cloudinary
        const { marca, modelo } = carResult.rows[0];
        const tag = `${marca}_${modelo}_${id}`;
        await cloudinary.api.delete_resources_by_tag(tag);
        
        res.sendStatus(204);
    } catch (error) {
        console.error('Erro ao deletar carro:', error);
        res.status(500).send('Erro ao deletar carro');
    }
}

// Adicionar Carro
async function addCar(req, res) {
    const {
        marca_id,
        modelo_id,
        ano_fabricacao,
        ano_modelo,
        quilometragem,
        cor,
        automatico,
        preco
    } = req.body;

    try {
        // Inserir novo carro
        const insertQuery = `
            INSERT INTO carros (
                modelo_id,
                ano_fabricacao,
                ano_modelo,
                quilometragem,
                cor,
                automatico,
                preco
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`;
        
        const result = await db.query(insertQuery, [
            modelo_id,
            ano_fabricacao,
            ano_modelo,
            quilometragem,
            cor,
            automatico,
            preco
        ]);
        
        const carId = result.rows[0].id;

        // Upload de imagens
        if (req.files?.photo) {
            const photos = Array.isArray(req.files.photo) 
                ? req.files.photo 
                : [req.files.photo];

            // Buscar info da marca/modelo para tags
            const modelQuery = `
                SELECT m.nome AS marca, md.nome AS modelo 
                FROM modelos md
                JOIN marcas m ON md.marca_id = m.id
                WHERE md.id = $1`;
            
            const modelResult = await db.query(modelQuery, [modelo_id]);
            const { marca, modelo } = modelResult.rows[0];
            const tag = `${marca}_${modelo}_${carId}`;

            for (const [index, photo] of photos.entries()) {
                await cloudinary.uploader.upload(photo.tempFilePath, {
                    folder: 'vehicle',
                    public_id: `${carId}_${index}`,
                    tags: [tag],
                    resource_type: 'image',
                    timeout: 120000     
                });
            }
        }

        res.redirect('/admin');
    } catch (error) {
        console.error('Erro ao adicionar carro:', error);
        res.status(500).send('Erro ao adicionar carro');
    }
}


async function add_marca(req, res) {

    const { nome } = req.body; 

    if (!nome) {
        return res.status(400).send('O nome da marca não pode ser vazio.');
    }

    try {
        const query = 'INSERT INTO marcas (nome) VALUES ($1)';
        await db.query(query, [nome]); 
        res.redirect('/admin');
    }

    catch(error){
        console.error('erro ao adicionar marca:', error);
        res.send('erro ao adicionar marca')
    }
}

async function add_modelo(req, res) {
    const { nome, marca_id } = req.body;
    if (!nome || !marca_id) {
        return res.status(400).send('O nome do modelo e a seleção da marca são obrigatórios.');
    }

    try {

        const insertQuery = `
            INSERT INTO modelos (nome, marca_id)
            VALUES ($1, $2)
            RETURNING id;
        `;
        const result = await db.query(insertQuery, [nome, marca_id]);
        res.redirect('/admin');

    } catch (error) {
        console.error('Erro ao adicionar modelo:', error);
        res.status(500).send('Erro de servidor ao adicionar o modelo.');
    }
}

module.exports = {
    loginAdmin,
    loadUsers,
    deleteUser,
    deleteCar,
    addCar,
    add_modelo,
    add_marca
};