import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Part 5 Analysis - FlexPDF Composite Check\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-part5-analysis'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    const paragraphs = page2.elements.filter(el => el.type === 'paragraph');
    
    console.log('🔍 Looking for Part 5 content...');
    
    // Find elements that contain Part 5 related content
    const part5Keywords = [
      'Can you share',
      'brief background',
      'yourself and your journey',
      'real estate development',
      'particularly in Saudi Arabia'
    ];
    
    console.log('\n📝 Part 5 Related Elements:');
    let part5Elements = [];
    
    paragraphs.forEach((para, idx) => {
      const hasKeyword = part5Keywords.some(keyword => 
        para.data.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasKeyword) {
        part5Elements.push(para);
        console.log(`${idx + 1}. [${para.data.length}ch] ${para.data.substring(0, 100)}...`);
        console.log(`   Font: ${para.attributes?.fontSize}pt, Composed: ${para.attributes?.composed}`);
        console.log(`   Elements merged: ${para.elements?.length || 'unknown'}`);
        console.log(`   BBox: L:${para.boundingBox?.left?.toFixed(1)} T:${para.boundingBox?.top?.toFixed(1)}`);
        console.log('');
      }
    });
    
    if (part5Elements.length === 0) {
      console.log('❌ No Part 5 content found in paragraphs');
      
      // Check if still in raw text elements
      const rawTexts = page2.elements.filter(el => el.type === 'text');
      console.log(`\n🔍 Checking ${rawTexts.length} raw text elements...`);
      
      rawTexts.forEach((el, idx) => {
        const hasKeyword = part5Keywords.some(keyword => 
          (el.data || '').toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasKeyword) {
          console.log(`Raw ${idx + 1}. [${(el.data || '').length}ch] ${(el.data || '').substring(0, 80)}...`);
        }
      });
    } else {
      console.log(`✅ Found ${part5Elements.length} Part 5 related paragraphs`);
      
      // Check if they should be merged into one composite
      if (part5Elements.length > 1) {
        console.log('\n⚠️ Part 5 appears fragmented into multiple paragraphs');
        console.log('🔧 FlexPDF Composite Analysis:');
        
        // Analyze spatial relationships
        for (let i = 0; i < part5Elements.length - 1; i++) {
          const current = part5Elements[i];
          const next = part5Elements[i + 1];
          
          const verticalGap = (next.boundingBox?.top || 0) - ((current.boundingBox?.top || 0) + (current.boundingBox?.height || 0));
          const fontSizeDiff = Math.abs((current.attributes?.fontSize || 12) - (next.attributes?.fontSize || 12));
          
          console.log(`   Gap between para ${i+1} & ${i+2}: ${verticalGap.toFixed(1)}px vertical, ${fontSizeDiff.toFixed(1)}pt font diff`);
        }
      }
    }
    
    console.log('\n🎯 FlexPDF Composite Requirements Check:');
    console.log('   ✅ OverlappingTextAlgorithm implemented');
    console.log('   ❓ OrderCompositesAlgorithm - reading order detection');
    console.log('   ❓ ComputeTextTypesAlgorithm - text type classification');
    console.log('   ❓ Priority-based execution system');
    
  }
})().catch(console.error);
