import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Debug Beam Scanning Algorithm\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-beam-debug'
  });
  
  const page3 = result.find(p => p.pageNumber === 3);
  if (page3) {
    console.log(`📄 Page 3 - Debug Column Detection:`);
    
    const textElements = page3.elements.filter(el => el.type === 'paragraph' || el.type === 'text');
    
    // Show detailed bounding boxes
    console.log(`\n📊 Detailed Bounding Boxes:`);
    textElements.forEach((el, idx) => {
      const bbox = el.boundingBox;
      console.log(`${idx + 1}. [L:${bbox?.left?.toFixed(1)} R:${(bbox?.left + bbox?.width)?.toFixed(1)} T:${bbox?.top?.toFixed(1)}]`);
      console.log(`   "${(el.data || '').substring(0, 60)}..."`);
    });
    
    // Manual column gap analysis
    const leftMost = Math.min(...textElements.map(el => el.boundingBox?.left || 0));
    const rightMost = Math.max(...textElements.map(el => (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0)));
    
    console.log(`\n🔍 Page Width Analysis:`);
    console.log(`   Left-most: ${leftMost.toFixed(1)}`);
    console.log(`   Right-most: ${rightMost.toFixed(1)}`);
    console.log(`   Page width: ${(rightMost - leftMost).toFixed(1)}`);
    
    // Check for gaps manually  
    console.log(`\n🔍 Manual Gap Detection:`);
    const positions = textElements.map(el => ({
      left: el.boundingBox?.left || 0,
      right: (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0)
    })).sort((a, b) => a.left - b.left);
    
    console.log(`   Element boundaries:`);
    positions.forEach((pos, idx) => {
      console.log(`   ${idx + 1}. L:${pos.left.toFixed(1)} - R:${pos.right.toFixed(1)}`);
    });
    
    // Look for gaps
    for (let i = 0; i < positions.length - 1; i++) {
      const currentRight = positions[i].right;
      const nextLeft = positions[i + 1].left;
      const gap = nextLeft - currentRight;
      
      if (gap > 10) {
        console.log(`   🔍 Gap found: ${currentRight.toFixed(1)} to ${nextLeft.toFixed(1)} (width: ${gap.toFixed(1)})`);
      }
    }
  }
  
})().catch(console.error);
