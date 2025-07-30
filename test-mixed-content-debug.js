import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Mixed Content Debug Test...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-mixed-debug'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log(`📄 Page 2 has ${page2.elements.length} elements\n`);
    
    // Find all composed paragraphs
    const composedParagraphs = page2.elements.filter(el => 
      el.attributes?.composed && el.data.length > 100
    );
    
    console.log(`📝 Found ${composedParagraphs.length} composed paragraphs:\n`);
    
    composedParagraphs.forEach((para, index) => {
      console.log(`=== PARAGRAPH ${index + 1} ===`);
      console.log('Length:', para.data.length, 'characters');
      console.log('FontSize:', para.attributes?.fontSize);
      console.log('Height:', para.height);
      console.log('First 100 chars:', para.data.substring(0, 100) + '...');
      
      // Check if it has the elements property
      if (para.elements) {
        const originalElements = para.elements;
        console.log('Original elements count:', originalElements.length);
        
        // Get unique font sizes from original elements
        const fontSizes = [...new Set(originalElements.map(el => el.attributes?.fontSize).filter(Boolean))];
        console.log('Font sizes in original elements:', fontSizes);
      }
      
      console.log('\n');
    });
    
    // Specifically look for our target paragraphs
    const part1 = page2.elements.find(el => 
      el.data.includes('In the midst of Saudi Arabia\'s sweeping wave')
    );
    
    const parts3to5 = page2.elements.filter(el => 
      el.data.includes('Mohammad excels in') || 
      el.data.includes('MOHAMMAD ALAWI') || 
      el.data.includes('CHAIRMAN')
    );
    
    console.log('🎯 TARGET ANALYSIS:');
    console.log('Part 1 (sweeping wave) found:', !!part1);
    if (part1) {
      console.log('  - Length:', part1.data.length);
      console.log('  - Contains full content:', part1.data.includes('entertainment offerings'));
    }
    
    console.log('Parts 3-5 (Mohammad info) found:', parts3to5.length, 'elements');
    parts3to5.forEach((part, i) => {
      console.log(`  Part ${i + 1}: ${part.data.substring(0, 50)}...`);
      console.log(`    Length: ${part.data.length} chars`);
    });
  }
})().catch(console.error);
