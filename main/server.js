const express = require('express');
const app = express();
const path = require('path');
const db = require('./db/consql')
const {mongo, mongoconn} = require('./db/conmongo');
const { DEFAULT_MIN_VERSION } = require('tls');
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'home'));
app.use(express.static(path.join(__dirname, 'features')));
app.use(express.static(path.join(__dirname, 'home')));
app.use(express.json());


mongoconn();

app.get('/', (req, res) => {
    res.render("main")
});

app.get('/load_cars', (req, res) => {
    const query = 'SELECT id, model, brand, km_driven, color, switch, nick FROM cars';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching cars:', err);
            return res.status(500).send('Error fetching cars');
        }

        const formattedCars = results.map(car => ({
            id: car.id,
            model: car.model,
            brand: car.brand,
            km_driven: car.km_driven,
            color: car.color,
            switch: car.switch,
            nick: car.nick
        }));
        res.json(formattedCars);
    });
});


app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
