const { createCanvas } = require('canvas');
const canvas = createCanvas(100, 100);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(10, 10, 80, 80);
console.log('Canvas test passed');
