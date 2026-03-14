const path = require('path');

module.exports = {
  entry: {
    background: './src/background.js',
    pair: './src/pair.js',
    popup: './src/popup.js',
    content: './src/content.js',
    pairing: './src/pairing.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  mode: 'production'
};
