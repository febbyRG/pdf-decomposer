import { decomposePdf } from './dist/api/decomposePdf.js';

// Manual column detection to verify what should happen
function detectColumnsManually(elements) {
  console.log('\n🔧 Manual Column Detection:');
  
  // Sort by left position
  const sortedByLeft = [...elements].sort((a, b) => (a.boundingBox?.left || 0) - (b.boundingBox?.left || 0));
  
  console.log('   Elements sorted by left position:');
  sortedByLeft.forEach((el, idx) => {
    const left = el.boundingBox?.left?.toFixed(1);
    const right = ((el.boundingBox?.left || 0) + (el.boundingBox?.width || 0))?.toFixed(1);
    console.log(`   ${idx + 1}. L:${left} R:${right} "${(el.data || '').substring(0, 30)}..."`);
  });
  
  // Find gaps
  const gaps = [];
  for (let i = 0; i < sortedByLeft.length - 1; i++) {
    const currentRight = (sortedByLeft[i].boundingBox?.left || 0) + (sortedByLeft[i].boundingBox?.width || 0);
    const nextLeft = sortedByLeft[i + 1].boundingBox?.left || 0;
    const gap = nextLeft - currentRight;
    
    if (gap >= 15) {
      gaps.push({
        from: currentRight,
        to: nextLeft,
        width: gap,
        breakPoint: (currentRight + nextLeft) / 2
      });
    }
  }
  
  console.log(`   Gaps found (>= 15pt):`);
  gaps.forEach((gap, idx) => {
    console.log(`   ${idx + 1}. ${gap.from.toFixed(1)} → ${gap.to.toFixed(1)} (width: ${gap.width.toFixed(1)}, break: ${gap.breakPoint.toFixed(1)})`);
  });
  
  // Create columns
  const columns = [];
  if (gaps.length === 0) {
    columns.push({
      leftBoundary: Math.min(...sortedByLeft.map(el => el.boundingBox?.left || 0)),
      rightBoundary: Math.max(...sortedByLeft.map(el => (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0))),
      elements: elements
    });
  } else {
    const leftMost = Math.min(...sortedByLeft.map(el => el.boundingBox?.left || 0));
    const rightMost = Math.max(...sortedByLeft.map(el => (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0)));
    
    let currentLeft = leftMost;
    
    for (let i = 0; i <= gaps.length; i++) {
      const currentRight = i < gaps.length ? gaps[i].breakPoint : rightMost;
      
      // Find elements in this column
      const columnElements = elements.filter(el => {
        const elementLeft = el.boundingBox?.left || 0;
        const elementRight = elementLeft + (el.boundingBox?.width || 0);
        const elementCenter = (elementLeft + elementRight) / 2;
        return elementCenter >= currentLeft && elementCenter <= currentRight;
      });
      
      if (columnElements.length > 0) {
        columns.push({
          leftBoundary: currentLeft,
          rightBoundary: currentRight,
          elements: columnElements
        });
      }
      
      currentLeft = currentRight;
    }
  }
  
  console.log(`   Columns created: ${columns.length}`);
  columns.forEach((col, idx) => {
    console.log(`   Column ${idx + 1}: ${col.leftBoundary.toFixed(1)} → ${col.rightBoundary.toFixed(1)} (${col.elements.length} elements)`);
    col.elements.forEach((el, elIdx) => {
      console.log(`      ${elIdx + 1}. "${(el.data || '').substring(0, 40)}..."`);
    });
  });
  
  // Expected reading order
  console.log(`\n📖 Expected Column-based Reading Order:`);
  let orderIndex = 1;
  columns.forEach((col, colIdx) => {
    console.log(`   Column ${colIdx + 1}:`);
    // Sort column elements by top position
    const sortedByTop = col.elements.sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0));
    sortedByTop.forEach((el, elIdx) => {
      console.log(`   ${orderIndex}. "${(el.data || '').substring(0, 50)}..."`);
      orderIndex++;
    });
  });
}

(async () => {
  console.log('🔍 Deep Debug Beam Scanning\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-deep-debug'
  });
  
  const page3 = result.find(p => p.pageNumber === 3);
  if (page3) {
    console.log(`📄 Page 3 - Deep Beam Scanning Debug:`);
    
    const textElements = page3.elements.filter(el => el.type === 'paragraph' || el.type === 'text');
    
    console.log(`\n📊 Current Reading Order (from algorithm):`);
    textElements.forEach((el, idx) => {
      const left = el.boundingBox?.left?.toFixed(1);
      const top = el.boundingBox?.top?.toFixed(1);
      console.log(`${idx + 1}. [L:${left} T:${top}] "${(el.data || '').substring(0, 50)}..."`);
    });
    
    // Manual column detection
    detectColumnsManually(textElements);
  }
  
})().catch(console.error);
