const path = require('path');

module.exports = {
  entry: {
    background: './src/background.js',
    popup: './src/popup.js',
    content: './src/content.js',
    pairing: './src/pairing.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    minimize: true,
    // Note: splitChunks is not used because Chrome MV3 service workers
    // and content scripts don't support dynamic chunk loading.
    // Instead we rely on production mode tree-shaking and minification
    // to reduce bundle sizes.
  }
};
