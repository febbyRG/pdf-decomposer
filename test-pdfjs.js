const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const pdfPath = path.join(__dirname, 'scripts', 'demo.pdf');

(async () => {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({ data }).promise;
    console.log('PDF loaded. Number of pages:', doc.numPages);
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    console.log('First page text content:', textContent.items.map(i => i.str).join(' '));
    console.log('PDF.js test passed');
  } catch (err) {
    console.error('PDF.js test failed:', err);
    console.dir(err, { depth: 10 });
  }
})();
