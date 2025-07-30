import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🔍 DETAILED POSITIONING ANALYSIS FOR 5-PART IMPROVEMENT...\n');
  
  // Test without elementComposer to see raw elements
  const rawResult = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: false,
    assetPath: './test-raw-analysis'
  });
  
  const rawPage2 = rawResult.find(p => p.pageNumber === 2);
  if (!rawPage2) {
    console.log('❌ Page 2 not found');
    return;
  }
  
  console.log(`📊 RAW Page 2 Analysis (${rawPage2.elements.length} elements):`);
  console.log('\n=== RAW ELEMENTS WITH POSITIONING ===');
  
  // Sort by reading order and show details
  const sortedElements = [...rawPage2.elements]
    .filter(el => el.type === 'text')
    .sort((a, b) => {
      const aTop = a.boundingBox?.top || a.y || 0;
      const bTop = b.boundingBox?.top || b.y || 0;
      const yDiff = aTop - bTop;
      
      if (Math.abs(yDiff) > 10) return yDiff;
      
      const aLeft = a.boundingBox?.left || a.x || 0;
      const bLeft = b.boundingBox?.left || b.x || 0;
      return aLeft - bLeft;
    });
  
  sortedElements.forEach((el, index) => {
    const preview = el.data.substring(0, 60).replace(/\s+/g, ' ').trim();
    const top = el.boundingBox?.top || el.y || 0;
    const left = el.boundingBox?.left || el.x || 0;
    const fontSize = el.attributes?.fontSize || el.font_size || 0;
    const color = el.fill_color || el.attributes?.color || 'default';
    
    console.log(`[${index + 1}] Y:${Math.round(top)} X:${Math.round(left)} F:${fontSize} "${preview}${el.data.length > 60 ? '...' : ''}"`);
  });
  
  console.log('\n=== SEMANTIC PATTERN ANALYSIS ===');
  
  // Analyze patterns that should group together
  const patterns = [
    { name: 'Headers/Titles', regex: /^[A-Z\s]+$/, minLength: 5 },
    { name: 'Opening phrases', regex: /^(In the midst|Can you share|My path into)/, minLength: 10 },
    { name: 'Names', regex: /(MOHAMMAD ALAWI|CHAIRMAN|RED SEA)/, minLength: 5 },
    { name: 'Bio phrases', regex: /^(With over|excels in|He has played)/, minLength: 10 },
    { name: 'Continuations', regex: /^(and |in |of |the |to |that |which |this )/, minLength: 5 }
  ];
  
  patterns.forEach(pattern => {
    const matches = sortedElements.filter(el => 
      pattern.regex.test(el.data) && el.data.length >= pattern.minLength
    );
    console.log(`${pattern.name}: ${matches.length} matches`);
    matches.forEach((match, i) => {
      const preview = match.data.substring(0, 40).replace(/\s+/g, ' ');
      console.log(`  [${i+1}] "${preview}..."`);
    });
  });
  
  console.log('\n=== CLUSTERING BY VERTICAL POSITION ===');
  
  // Group by approximate Y position (within 50px)
  const clusters = [];
  sortedElements.forEach(el => {
    const top = el.boundingBox?.top || el.y || 0;
    let cluster = clusters.find(c => Math.abs(c.avgTop - top) < 50);
    
    if (!cluster) {
      cluster = { avgTop: top, elements: [], minTop: top, maxTop: top };
      clusters.push(cluster);
    }
    
    cluster.elements.push(el);
    cluster.minTop = Math.min(cluster.minTop, top);
    cluster.maxTop = Math.max(cluster.maxTop, top);
    cluster.avgTop = (cluster.minTop + cluster.maxTop) / 2;
  });
  
  clusters.sort((a, b) => a.avgTop - b.avgTop);
  
  clusters.forEach((cluster, index) => {
    console.log(`Cluster ${index + 1} (Y: ${Math.round(cluster.minTop)}-${Math.round(cluster.maxTop)}): ${cluster.elements.length} elements`);
    cluster.elements.forEach((el, i) => {
      const preview = el.data.substring(0, 50).replace(/\s+/g, ' ');
      console.log(`  [${i+1}] "${preview}..."`);
    });
  });
  
})();
