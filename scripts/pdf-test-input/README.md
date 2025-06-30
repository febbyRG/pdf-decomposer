# PDF Test Files

This directory contains PDF files used for testing the pdf-decomposer library.

## Important Notes

- **PDF files are NOT committed to the repository** - they are excluded by .gitignore
- **Generated outputs are NOT committed** - all images and JSON outputs are excluded
- **Only .gitkeep files are tracked** to preserve directory structure

## For Developers

If you're working on this project and need test files:

1. **Add your own PDF files** to this directory for testing
2. **Use any PDF files** - the tests will work with any valid PDF
3. **Don't commit PDF files** - they will be automatically ignored by git

## Test Files

The following files are typically used for testing (not in git):
- `demo.pdf` - Sample PDF for testing (6 pages)
- `test.pdf` - Additional test PDF

## Running Tests

```bash
# Run comprehensive test suite
npm test

# Run usage example
npm run test:usage
```

The tests will automatically find PDF files in this directory and use them for testing.
