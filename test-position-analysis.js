import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Detailed Position Analysis Debug...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-position-debug'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log(`📄 Page 2 has ${page2.elements.length} elements\n`);
    
    // Find the problematic composed paragraphs
    const composedParagraphs = page2.elements.filter(el => 
      el.attributes?.composed && el.data.length > 100
    );
    
    composedParagraphs.forEach((para, index) => {
      console.log(`=== ANALYZING PARAGRAPH ${index + 1} ===`);
      console.log('Length:', para.data.length, 'characters');
      console.log('Height:', para.boundingBox?.height);
      console.log('First 100 chars:', para.data.substring(0, 100) + '...');
      
      // Detailed analysis of original elements
      if (para.elements) {
        console.log('\n📊 ORIGINAL ELEMENTS ANALYSIS:');
        para.elements.forEach((el, i) => {
          const top = el.boundingBox?.top || el.y || 0;
          const left = el.boundingBox?.left || el.x || 0;
          const fontSize = el.attributes?.fontSize || 12;
          const height = el.boundingBox?.height || 12;
          
          console.log(`  Element ${i + 1}: "${(el.data || '').substring(0, 30)}..."`);
          console.log(`    Position: top=${top.toFixed(1)}, left=${left.toFixed(1)}, height=${height.toFixed(1)}`);
          console.log(`    Font: ${fontSize}px`);
          
          if (i > 0) {
            const prevEl = para.elements[i - 1];
            const prevBottom = (prevEl.boundingBox?.top || 0) + (prevEl.boundingBox?.height || 12);
            const gap = top - prevBottom;
            console.log(`    Gap from previous: ${gap.toFixed(1)}px`);
          }
        });
        
        // Check what our positioning analysis would say
        console.log('\n🔬 POSITION ANALYSIS RESULTS:');
        // We need to simulate the analyzeElementPositions method
        const sortedElements = [...para.elements].sort((a, b) => {
          const aTop = a.boundingBox?.top || a.y || 0;
          const bTop = b.boundingBox?.top || b.y || 0;
          return aTop - bTop;
        });
        
        let groups = [];
        let currentGroup = [];
        let maxGap = 0;
        
        for (let i = 0; i < sortedElements.length; i++) {
          const current = sortedElements[i];
          const currentTop = current.boundingBox?.top || current.y || 0;
          
          if (currentGroup.length === 0) {
            currentGroup.push(current);
          } else {
            const previous = currentGroup[currentGroup.length - 1];
            const previousBottom = (previous.boundingBox?.top || previous.y || 0) + (previous.boundingBox?.height || 12);
            const gap = currentTop - previousBottom;
            
            maxGap = Math.max(maxGap, gap);
            
            if (gap > 15) {
              groups.push([...currentGroup]);
              currentGroup = [current];
            } else {
              currentGroup.push(current);
            }
          }
        }
        
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        
        const uniqueFontSizes = [...new Set(para.elements.map(el => el.attributes?.fontSize || 12))];
        
        console.log(`    Vertical groups: ${groups.length}`);
        console.log(`    Max vertical gap: ${maxGap.toFixed(1)}px`);
        console.log(`    Unique font sizes: ${uniqueFontSizes.join(', ')}`);
        console.log(`    Should split: ${groups.length >= 2 && maxGap > 20 && uniqueFontSizes.length >= 2}`);
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    });
  }
})().catch(console.error);
