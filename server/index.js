const express = require('express');
const app = express();
require('dotenv').config();

app.use(express.json());

// Routes
app.use('/auth',        require('./routes/auth'));
app.use('/meals',       require('./routes/meals'));
app.use('/workouts',    require('./routes/workouts'));
app.use('/suggestions', require('./routes/suggestions'));
app.use('/recovery',    require('./routes/recovery'));


app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FuelSync server running on port ${PORT}`);
});