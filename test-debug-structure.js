import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🔍 Debug page structure...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-debug-structure'
  });
  
  console.log('Result type:', typeof result);
  console.log('Result is array:', Array.isArray(result));
  
  if (Array.isArray(result)) {
    console.log(`Number of pages: ${result.length}`);
    result.forEach((page, index) => {
      console.log(`Page ${index + 1}:`, {
        pageNumber: page.pageNumber,
        properties: Object.keys(page),
        textElementsLength: page.textElements?.length || 0,
        elementsLength: page.elements?.length || 0
      });
    });
    
    // Show full structure of first page
    if (result.length > 0) {
      console.log('\nFirst page full structure:');
      console.log(Object.keys(result[0]));
    }
  } else if (result.pages) {
    console.log(`Number of pages: ${result.pages.length}`);
    result.pages.forEach((page, index) => {
      console.log(`Page ${index + 1}:`, {
        pageNumber: page.pageNumber,
        hasData: !!page.data,
        dataLength: page.data?.length || 0
      });
    });
  } else {
    console.log('Result structure:', Object.keys(result));
  }
})();
