const  db = require('../db/consql.js');
const cloudinary = require('../db/cloud.js');

async function loadCars(req, res) {
    const query = `
        SELECT
            c.id,
            m.nome AS brand,
            md.nome AS model,
            c.ano_fabricacao AS year,
            c.ano_modelo AS model_year,
            c.quilometragem AS km_driven,
            c.cor AS color,
            c.automatico AS automatic,
            c.preco AS price,
            c.data_criacao AS created_at
        FROM carros c
        JOIN modelos md ON c.modelo_id = md.id
        JOIN marcas m ON md.marca_id = m.id
        WHERE c.preco > 0`;

    db.query(query, async (err, results) => {
        if (err) {
            console.log('Erro ao buscar carros:', err);
            return res.status(500).send('Erro ao buscar carros');
        }

        const cars = results.rows;

        const formattedCars = await Promise.all(cars.map(async car => {
            try {
                // Ajuste a lógica de tags conforme seus novos requisitos
                const expression = `public_id:vehicle/${car.id}_0`;
                
                const cloudinaryResponse = await cloudinary.search
                    .expression(expression)
                    .max_results(1)
                    .execute();

                const carImages = cloudinaryResponse.resources.map(resource => resource.secure_url);

                return {
                    ...car,
                    year: car.year,
                    switch: car.automatic, // Mantendo compatibilidade
                    images: carImages
                };
            } catch (error) {
                console.error(`Erro buscando imagens do carro ID ${car.id}:`, error);
                return {
                    ...car,
                    images: []
                };
            }
        }));
        
        res.json(formattedCars);
    });
}



async function loadDetails(req, res) {
    const id = req.params.id;
    const query = `
        SELECT
            c.id,
            m.nome AS brand,
            md.nome AS model,
            c.ano_fabricacao AS year,
            c.ano_modelo AS model_year,
            c.quilometragem AS km_driven,
            c.cor AS color,
            c.automatico AS automatic,
            c.preco AS price,
            c.data_criacao AS created_at
        FROM carros c
        JOIN modelos md ON c.modelo_id = md.id
        JOIN marcas m ON md.marca_id = m.id
        WHERE c.id = $1`;

    db.query(query, [id], async (err, results) => {
        if (err) {
            console.error('Erro ao buscar detalhes do carro:', err);
            return res.status(500).send('Erro ao buscar detalhes do carro');
        }

        if (!results.rows || results.rows.length === 0) {
            return res.status(404).send('Carro não encontrado');
        }

        const car = results.rows[0];

        try {
            const tag = `${car.brand}_${car.model}_${car.id}`;
            const respostaCloudinary = await cloudinary.api.resources_by_tag(tag, {
                max_results: 10,
                resource_type: 'image'
            });
            
            car.images = respostaCloudinary.resources?.map(recurso => recurso.secure_url) || [];
            
        } catch (error) {
            console.error(`Erro ao buscar imagens do carro ID ${car.id}:`, error);
            car.images = [];
        }

        // Mantendo a estrutura anterior para compatibilidade
        res.render('details', { 
            car: {
                ...car,
                switch: car.automatic,
                year: car.year,
                brand: car.brand,
                model: car.model
            }
        });
    });
}

module.exports = {loadCars,loadDetails};