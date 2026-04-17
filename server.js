const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

// Serve static marketing files
app.use(express.static(path.join(__dirname, 'marketing')));

// Health check (Railway requirement)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: require('./package.json').version });
});

// Catch-all to serve index.html for SPA-like routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'marketing', 'index.html'));
});

app.listen(port, () => {
  console.log(`OpenClaw Console landing live on port ${port}`);
});