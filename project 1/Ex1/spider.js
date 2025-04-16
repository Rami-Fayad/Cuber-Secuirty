#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Default configuration
const config = {
    recursive: false,
    maxDepth: 5,
    savePath: './data/',
    validExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp'],
    visitedUrls: new Set()
};

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    let url = null;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-r':
                config.recursive = true;
                break;
            case '-l':
                if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                    config.maxDepth = parseInt(args[++i]) || 5;
                }
                break;
            case '-p':
                if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                    config.savePath = args[++i];
                }
                break;
            default:
                if (!args[i].startsWith('-')) {
                    url = args[i];
                }
        }
    }

    if (!url) {
        console.error('Error: URL is required');
        console.log('Usage: ./spider [-r] [-l DEPTH] [-p PATH] URL');
        process.exit(1);
    }

    return url;
}

// Create necessary directories
function setupDirectories() {
    if (!fs.existsSync(config.savePath)) {
        fs.mkdirSync(config.savePath, { recursive: true });
    }
}

// Download an image
function downloadImage(imageUrl, baseUrl) {
    return new Promise((resolve, reject) => {
        try {
            const fullUrl = new URL(imageUrl, baseUrl);
            const ext = path.extname(fullUrl.pathname).toLowerCase();
            
            if (!config.validExtensions.includes(ext)) {
                resolve();
                return;
            }

            const filename = path.basename(fullUrl.pathname);
            if (!filename) {
                resolve();
                return;
            }

            const filePath = path.join(config.savePath, filename);
            const protocol = fullUrl.protocol === 'https:' ? https : http;
            
            protocol.get(fullUrl, (response) => {
                if (response.statusCode === 200) {
                    const fileStream = fs.createWriteStream(filePath);
                    response.pipe(fileStream);
                    
                    fileStream.on('finish', () => {
                        fileStream.close();
                        console.log(`Downloaded: ${filename}`);
                        resolve();
                    });

                    fileStream.on('error', (err) => {
                        console.error(`Error saving ${filename}: ${err.message}`);
                        resolve();
                    });
                } else {
                    console.error(`Failed to download ${filename}: Status ${response.statusCode}`);
                    resolve();
                }
            }).on('error', (err) => {
                console.error(`Error downloading ${filename}: ${err.message}`);
                resolve();
            });
        } catch (error) {
            console.error(`Error processing ${imageUrl}: ${error.message}`);
            resolve();
        }
    });
}

// Fetch and parse webpage
async function fetchPage(url, depth = 0) {
    if (depth >= config.maxDepth || config.visitedUrls.has(url)) {
        return;
    }

    config.visitedUrls.add(url);
    console.log(`Processing ${url} (depth: ${depth})`);

    return new Promise((resolve, reject) => {
        try {
            const protocol = url.startsWith('https') ? https : http;
            
            protocol.get(url, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', async () => {
                    try {
                        // Extract image URLs
                        const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
                        const downloadPromises = [];
                        let match;
                        
                        while ((match = imgRegex.exec(data)) !== null) {
                            downloadPromises.push(downloadImage(match[1], url));
                        }

                        // Wait for all images to download
                        await Promise.all(downloadPromises);
                        
                        // If recursive, find and follow links
                        if (config.recursive) {
                            const linkRegex = /<a[^>]+href=["']([^"']+)["']/g;
                            const pagePromises = [];
                            
                            while ((match = linkRegex.exec(data)) !== null) {
                                try {
                                    const linkUrl = new URL(match[1], url).href;
                                    if (linkUrl.startsWith(new URL(url).origin) && !config.visitedUrls.has(linkUrl)) {
                                        pagePromises.push(fetchPage(linkUrl, depth + 1));
                                    }
                                } catch (error) {
                                    // Skip invalid URLs
                                }
                            }

                            // Wait for all pages to be processed
                            await Promise.all(pagePromises);
                        }
                        
                        resolve();
                    } catch (error) {
                        console.error(`Error processing page content: ${error.message}`);
                        resolve();
                    }
                });
            }).on('error', (err) => {
                console.error(`Error fetching ${url}: ${err.message}`);
                resolve();
            });
        } catch (error) {
            console.error(`Error processing URL ${url}: ${error.message}`);
            resolve();
        }
    });
}

// Main function
async function main() {
    const url = parseArguments();
    setupDirectories();
    console.log(`Starting spider with configuration:
    URL: ${url}
    Recursive: ${config.recursive}
    Max Depth: ${config.maxDepth}
    Save Path: ${config.savePath}`);
    
    try {
        await fetchPage(url);
        console.log('Spider completed successfully');
    } catch (error) {
        console.error('Spider failed:', error.message);
        process.exit(1);
    }
}

main();