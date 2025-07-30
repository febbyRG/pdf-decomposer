import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Header Detection Analysis\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-header-analysis'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log(`📄 Page 2 Elements Analysis:`);
    
    // FlexPDF approach: Statistical analysis only, no hardcoded content
    const textElements = page2.elements.filter(el => el.type === 'paragraph' || el.type === 'text');
    const fontSizes = textElements.map(el => el.attributes?.fontSize || 12);
    const totalChars = textElements.reduce((sum, el) => sum + (el.data || '').length, 0);
    const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length;
    
    console.log('\n📈 FlexPDF Statistical Analysis:');
    console.log(`   Total elements: ${textElements.length}`);
    console.log(`   Average font size: ${avgFontSize.toFixed(2)}pt`);
    console.log(`   Font sizes found: ${[...new Set(fontSizes)].sort((a,b) => b-a).join(', ')}pt`);
    
    // FlexPDF heading thresholds
    const headingThresholds = [
      { type: 'h1', size: 2.1 * avgFontSize },
      { type: 'h2', size: 1.75 * avgFontSize },
      { type: 'h3', size: 1.5 * avgFontSize },
      { type: 'h4', size: 1.25 * avgFontSize },
      { type: 'h5', size: 1.1 * avgFontSize }
    ];
    
    console.log('\n🎯 FlexPDF Heading Thresholds:');
    headingThresholds.forEach(threshold => {
      console.log(`   ${threshold.type}: ≥ ${threshold.size.toFixed(1)}pt`);
    });
    
    console.log('\n📊 Element Classification Analysis:');
    textElements.forEach((el, idx) => {
      const fontSize = el.attributes?.fontSize || 12;
      const text = (el.data || '').trim();
      const wordCount = text.split(/\s+/).filter(str => str !== '').length;
      const isLongText = wordCount > 15;
      const currentType = el.attributes?.type || 'undefined';
      
      // FlexPDF logic: fontSize > avgFontSize AND not long text
      if (fontSize > avgFontSize && !isLongText) {
        const heading = headingThresholds.find(threshold => Math.floor(threshold.size) <= fontSize);
        const shouldBeHeader = heading ? heading.type : 'h5';
        
        console.log(`${idx + 1}. [${fontSize}pt, ${wordCount}w] "${text.substring(0, 50)}..."`);
        console.log(`   Current: ${currentType} → Should be: ${shouldBeHeader}`);
        console.log(`   Position: L:${el.boundingBox?.left?.toFixed(1)} T:${el.boundingBox?.top?.toFixed(1)}`);
        console.log('');
      } else if (fontSize <= avgFontSize || isLongText) {
        // Should be paragraph
        if (currentType !== 'paragraph' && text.length > 20) {
          console.log(`${idx + 1}. [${fontSize}pt, ${wordCount}w] "${text.substring(0, 50)}..."`);
          console.log(`   Current: ${currentType} → Should be: paragraph`);
          console.log('');
        }
      }
    });
    
    // Check for potential header merging issues
    console.log('🔍 Header Merging Analysis:');
    const largefonts = textElements.filter(el => (el.attributes?.fontSize || 12) > avgFontSize);
    
    if (largefonts.length > 1) {
      console.log(`   Found ${largefonts.length} large font elements - analyzing spatial relationships:`);
      largefonts.forEach((el, idx) => {
        console.log(`   ${idx + 1}. [${el.attributes?.fontSize}pt] "${(el.data || '').substring(0, 40)}..."`);
        console.log(`      Type: ${el.type}, Classification: ${el.attributes?.type}`);
        console.log(`      Position: L:${el.boundingBox?.left?.toFixed(1)} T:${el.boundingBox?.top?.toFixed(1)}`);
        console.log(`      Size: W:${el.boundingBox?.width?.toFixed(1)} H:${el.boundingBox?.height?.toFixed(1)}`);
        
        // Check spatial relationship with next element
        if (idx + 1 < largefonts.length) {
          const next = largefonts[idx + 1];
          const verticalGap = Math.abs((next.boundingBox?.top || 0) - ((el.boundingBox?.top || 0) + (el.boundingBox?.height || 0)));
          const horizontalAlignment = Math.abs((el.boundingBox?.left || 0) - (next.boundingBox?.left || 0));
          
          console.log(`      → Gap to next: ${verticalGap.toFixed(1)}pt vertical, ${horizontalAlignment.toFixed(1)}pt horizontal offset`);
          
          // FlexPDF header merging criteria
          const shouldMerge = verticalGap < 50 && horizontalAlignment < 10 && 
                             Math.abs((el.attributes?.fontSize || 12) - (next.attributes?.fontSize || 12)) < (el.attributes?.fontSize || 12) * 0.7;
          
          console.log(`      → FlexPDF should merge: ${shouldMerge ? '✅ YES - Headers spatially related' : '❌ NO - Too distant/different'}`);
        }
        console.log('');
      });
    } else {
      console.log(`   ✅ Large font elements properly merged: ${largefonts.length}`);
    }
  }
})().catch(console.error);
