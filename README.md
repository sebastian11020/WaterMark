# Image Watermarking Project

This project allows users to upload images and apply a watermark to them using a Node.js server. The server handles file uploads, processes the image, and returns the watermarked image to the client.

## Features

- Upload images in various formats (JPEG, PNG, BMP, TIFF).
- Convert WebP images to PNG format.
- Apply a watermark to the uploaded image.
- Resize the output image to a standard size (800x600 pixels).
- Supports cross-origin resource sharing (CORS) for easy integration with front-end applications.

## Technologies Used

- **Node.js**: JavaScript runtime for building the server.
- **Express**: Web framework for Node.js to handle HTTP requests.
- **Jimp**: Image processing library for handling image manipulation and watermarking.
- **Sharp**: High-performance image processing library for converting image formats.
- **Express-fileupload**: Middleware for handling file uploads in Express.
- **CORS**: Middleware to allow cross-origin requests.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/image-watermarking.git
   cd image-watermarking
