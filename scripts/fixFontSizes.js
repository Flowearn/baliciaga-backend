const fs = require('fs').promises;
const path = require('path');

// Fix incorrect font size classes
const fixMap = {
  'text-xl-new-new-new': 'text-xs',
  'text-xl-new-new': 'text-sm',
  'text-xl-new': 'text-base',
  'text-base-new': 'text-base',
  'text-sm-new': 'text-sm',
};

async function fixFontSizesInFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let hasChanges = false;

    for (const [wrongClass, correctClass] of Object.entries(fixMap)) {
      const regex = new RegExp(`\\b${wrongClass}\\b`, 'g');
      if (content.match(regex)) {
        content = content.replace(regex, correctClass);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function processDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let totalFixed = 0;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
        totalFixed += await processDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const fixed = await fixFontSizesInFile(fullPath);
      if (fixed) totalFixed++;
    }
  }
  
  return totalFixed;
}

async function main() {
  console.log('🔧 Fixing font size classes...\n');
  
  const frontendDir = path.join(__dirname, '../../frontend/src');
  const totalFixed = await processDirectory(frontendDir);
  
  console.log(`\n✨ Complete! Fixed ${totalFixed} files.`);
}

main().catch(console.error);