#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Supported file extensions
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];

/**
 * Parse command line arguments
 */
function parseArguments() {
    const files = process.argv.slice(2);
    
    if (files.length === 0) {
        console.error('Error: At least one file is required');
        console.log('Usage: ./scorpion FILE1 [FILE2 ...]');
        process.exit(1);
    }
    
    return files;
}

/**
 * Read JPEG EXIF data
 */
function parseJpegExif(buffer) {
    try {
        const exif = {};
        
        // Check for JPEG SOI marker
        if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
            return exif;
        }
        
        // Look for APP1 marker (contains EXIF)
        let offset = 2;
        while (offset < buffer.length - 1) {
            if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xE1) {
                const segmentLength = buffer.readUInt16BE(offset + 2);
                
                // Check for 'Exif' string
                if (buffer.slice(offset + 4, offset + 8).toString() === 'Exif') {
                    const exifData = buffer.slice(offset + 10, offset + segmentLength + 2);
                    
                    // Extract common EXIF fields
                    const makeMatch = /Make\0{3}(.+?)\0/i.exec(exifData);
                    if (makeMatch) {
                        exif.Make = makeMatch[1].trim();
                    }
                    
                    const modelMatch = /Model\0{2}(.+?)\0/i.exec(exifData);
                    if (modelMatch) {
                        exif.Model = modelMatch[1].trim();
                    }
                    
                    // Try to extract date
                    const dateMatch = /DateTimeOriginal\0(.{19})/i.exec(exifData);
                    if (dateMatch) {
                        exif.DateTaken = dateMatch[1].trim();
                    }
                    
                    // Extract dimensions if available
                    if (offset + 30 < buffer.length) {
                        exif.Width = buffer.readUInt16BE(offset + 20);
                        exif.Height = buffer.readUInt16BE(offset + 22);
                    }
                    
                    break;
                }
                
                offset += 2 + segmentLength;
            } else if (buffer[offset] === 0xFF) {
                offset += 2;
                if (offset < buffer.length - 1) {
                    offset += buffer.readUInt16BE(offset);
                }
            } else {
                offset += 1;
            }
        }
        
        return exif;
    } catch (e) {
        return {};
    }
}

/**
 * Extract PNG metadata
 */
function parsePngMetadata(buffer) {
    try {
        const metadata = {};
        
        // Verify PNG signature
        if (buffer.toString('ascii', 1, 4) !== 'PNG') {
            return metadata;
        }
        
        // Get dimensions
        metadata.Width = buffer.readUInt32BE(16);
        metadata.Height = buffer.readUInt32BE(20);
        
        // Get color type and bit depth
        metadata.BitDepth = buffer[24];
        metadata.ColorType = buffer[25];
        
        return metadata;
    } catch (e) {
        return {};
    }
}

/**
 * Extract GIF metadata
 */
function parseGifMetadata(buffer) {
    try {
        const metadata = {};
        
        // Verify GIF signature
        if (buffer.toString('ascii', 0, 3) !== 'GIF') {
            return metadata;
        }
        
        // Get version
        metadata.Version = buffer.toString('ascii', 3, 6);
        
        // Get dimensions
        metadata.Width = buffer.readUInt16LE(6);
        metadata.Height = buffer.readUInt16LE(8);
        
        // Get color information
        const packed = buffer[10];
        metadata.ColorTableSize = 2 << (packed & 0x07);
        metadata.ColorResolution = ((packed & 0x70) >> 4) + 1;
        metadata.GlobalColorTable = (packed & 0x80) !== 0;
        
        return metadata;
    } catch (e) {
        return {};
    }
}

/**
 * Extract BMP metadata
 */
function parseBmpMetadata(buffer) {
    try {
        const metadata = {};
        
        // Verify BMP signature
        if (buffer.toString('ascii', 0, 2) !== 'BM') {
            return metadata;
        }
        
        // Get file size
        metadata.FileSize = buffer.readUInt32LE(2);
        
        // Get dimensions
        metadata.Width = buffer.readInt32LE(18);
        metadata.Height = Math.abs(buffer.readInt32LE(22));
        
        // Get color depth
        metadata.BitsPerPixel = buffer.readUInt16LE(28);
        
        return metadata;
    } catch (e) {
        return {};
    }
}

/**
 * Analyze a single image file
 */
function analyzeImage(filePath) {
    try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return {
                file: filePath,
                error: 'File does not exist'
            };
        }
        
        // Check file extension
        const ext = path.extname(filePath).toLowerCase();
        if (!VALID_EXTENSIONS.includes(ext)) {
            return {
                file: filePath,
                error: 'Unsupported file type'
            };
        }
        
        // Get basic file info
        const stats = fs.statSync(filePath);
        const buffer = fs.readFileSync(filePath);
        
        const metadata = {
            file: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            format: ext.slice(1).toUpperCase()
        };
        
        // Get format-specific metadata
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                Object.assign(metadata, parseJpegExif(buffer));
                break;
            case '.png':
                Object.assign(metadata, parsePngMetadata(buffer));
                break;
            case '.gif':
                Object.assign(metadata, parseGifMetadata(buffer));
                break;
            case '.bmp':
                Object.assign(metadata, parseBmpMetadata(buffer));
                break;
        }
        
        return metadata;
    } catch (error) {
        return {
            file: filePath,
            error: error.message
        };
    }
}

/**
 * Format metadata for display
 */
function formatMetadata(metadata) {
    const output = [''];
    output.push(`File: ${metadata.file}`);
    output.push('----------------------------------------');
    
    if (metadata.error) {
        output.push(`Error: ${metadata.error}`);
        return output.join('\n');
    }
    
    // Basic information
    output.push(`Format: ${metadata.format}`);
    output.push(`Size: ${(metadata.size / 1024).toFixed(2)} KB`);
    output.push(`Created: ${metadata.created}`);
    output.push(`Modified: ${metadata.modified}`);
    
    // Dimensions
    if (metadata.Width && metadata.Height) {
        output.push(`Dimensions: ${metadata.Width}x${metadata.Height}`);
    }
    
    // Format specific information
    switch (metadata.format) {
        case 'JPEG':
            if (metadata.Make || metadata.Model) {
                output.push('\nCamera Information:');
                if (metadata.Make) output.push(`Make: ${metadata.Make}`);
                if (metadata.Model) output.push(`Model: ${metadata.Model}`);
            }
            if (metadata.DateTaken) {
                output.push(`Date Taken: ${metadata.DateTaken}`);
            }
            break;
            
        case 'PNG':
            if (metadata.BitDepth) {
                output.push(`Bit Depth: ${metadata.BitDepth}`);
            }
            if (metadata.ColorType !== undefined) {
                output.push(`Color Type: ${metadata.ColorType}`);
            }
            break;
            
        case 'GIF':
            if (metadata.Version) {
                output.push(`Version: ${metadata.Version}`);
            }
            if (metadata.ColorTableSize) {
                output.push(`Color Table Size: ${metadata.ColorTableSize} colors`);
            }
            break;
            
        case 'BMP':
            if (metadata.BitsPerPixel) {
                output.push(`Color Depth: ${metadata.BitsPerPixel} bits`);
            }
            break;
    }
    
    return output.join('\n');
}

/**
 * Main function
 */
function main() {
    const files = parseArguments();
    
    for (const file of files) {
        const metadata = analyzeImage(file);
        console.log(formatMetadata(metadata));
    }
}

main(); 