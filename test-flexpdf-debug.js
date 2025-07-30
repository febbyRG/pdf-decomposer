import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 FlexPDF-inspired debugging...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-flexpdf-debug'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log(`📄 Page 2 has ${page2.elements.length} elements total`);
    
    // Debug: Show all element types
    const elementTypes = {};
    page2.elements.forEach(el => {
      elementTypes[el.type] = (elementTypes[el.type] || 0) + 1;
    });
    console.log('🔍 Element types distribution:', elementTypes);
    
    // Check text elements specifically
    const textElements = page2.elements.filter(el => el.type === 'text');
    console.log(`📝 Text elements: ${textElements.length}`);
    
    // If no text elements, show first few elements for debugging
    if (textElements.length === 0) {
      console.log('\n⚠️ No text elements found! Showing all elements:');
      page2.elements.slice(0, 10).forEach((el, idx) => {
        console.log(`${idx + 1}. Type: ${el.type}, Data: "${(el.data || '').substring(0, 50)}..."`);
        console.log(`   Attributes: ${JSON.stringify(el.attributes)}`);
        console.log('');
      });
      return;
    }
    
    // FlexPDF-inspired: Analyze page statistics dynamically
    const fontSizes = textElements.map(el => el.attributes?.fontSize || 12);
    const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length;
    const fontSizeDistribution = {};
    fontSizes.forEach(size => {
      fontSizeDistribution[size] = (fontSizeDistribution[size] || 0) + 1;
    });
    
    console.log('\n� FlexPDF-inspired Page Statistics:');
    console.log(`   Average font size: ${avgFontSize.toFixed(2)}`);
    console.log(`   Font size distribution:`, fontSizeDistribution);
    
    // Analyze clustering effectiveness
    const composedElements = textElements.filter(el => el.attributes?.composed);
    const originalElements = textElements.filter(el => !el.attributes?.composed);
    
    console.log('\n🔗 Clustering Analysis:');
    console.log(`   Original elements: ${originalElements.length}`);
    console.log(`   Composed paragraphs: ${composedElements.length}`);
    console.log(`   Compression ratio: ${originalElements.length > 0 ? (100 - (composedElements.length / originalElements.length * 100)).toFixed(1) : 0}%`);
    
    // Show paragraph composition results for analysis
    console.log('\n� Paragraph Composition Results:');
    composedElements.slice(0, 5).forEach((el, idx) => {
      console.log(`${idx + 1}. [${el.data.length} chars] ${el.data.substring(0, 80)}...`);
      console.log(`   Font: ${el.attributes?.fontSize}, Elements merged: ${el.elements?.length || 'unknown'}`);
      console.log(`   BBox: L:${el.boundingBox?.left?.toFixed(1)} T:${el.boundingBox?.top?.toFixed(1)} W:${el.boundingBox?.width?.toFixed(1)} H:${el.boundingBox?.height?.toFixed(1)}`);
      console.log('');
    });
    
    // Analyze spatial distribution
    const topPositions = textElements.map(el => el.boundingBox?.top || 0).sort((a, b) => a - b);
    const leftPositions = textElements.map(el => el.boundingBox?.left || 0).sort((a, b) => a - b);
    
    console.log('\n📐 Spatial Distribution Analysis:');
    console.log(`   Top range: ${topPositions[0]?.toFixed(1)} - ${topPositions[topPositions.length-1]?.toFixed(1)}`);
    console.log(`   Left range: ${leftPositions[0]?.toFixed(1)} - ${leftPositions[leftPositions.length-1]?.toFixed(1)}`);
    console.log(`   Layout appears: ${analyzeLayoutPattern(textElements)}`);
    
  }
})().catch(console.error);

function analyzeLayoutPattern(elements) {
  const leftAligned = elements.filter(el => (el.boundingBox?.left || 0) < 100).length;
  const centerAligned = elements.filter(el => {
    const left = el.boundingBox?.left || 0;
    return left >= 100 && left <= 300;
  }).length;
  const rightAligned = elements.filter(el => (el.boundingBox?.left || 0) > 300).length;
  
  if (leftAligned > centerAligned && leftAligned > rightAligned) return 'Left-aligned document';
  if (centerAligned > leftAligned && centerAligned > rightAligned) return 'Center-aligned content';
  return 'Mixed layout document';
}
