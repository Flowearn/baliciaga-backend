const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  console.log('Request:', req.url);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.url === '/' || req.url === '/image_preview.html') {
    fs.readFile('./image_preview.html', (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${port}/`);
  console.log(`📱 Access your preview at: http://localhost:${port}/image_preview.html`);
  console.log(`📶 Or on your phone at: http://[YOUR_IP]:${port}/image_preview.html`);
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
}); 