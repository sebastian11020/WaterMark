const validMimeTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff'];

async function uploadImage() {
    const fileInput = document.getElementById('imageUpload');
    const file = fileInput.files[0];

    console.log("Archivo seleccionado:", file);

    if (!file || !validMimeTypes.includes(file.type)) {
        alert("Por favor, sube un archivo de imagen válido (jpeg, png, bmp, tiff).");
        console.error("Archivo no válido:", file ? file.type : "Ningún archivo seleccionado");
        return;
    }

    const formData = new FormData();
    formData.append('image', file);
    
    try {
        console.log("Enviando imagen al middleware...");
        const response = await fetch('http://192.168.20.75:4000/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Error al subir la imagen. Estado: ${response.status}`);
        }

        console.log("Imagen subida correctamente. Procesando la respuesta...");
        const blob = await response.blob();
        const imgUrl = URL.createObjectURL(blob);
        document.getElementById('watermarkedImage').src = imgUrl;

        console.log("Imagen procesada con éxito:", imgUrl);
    } catch (error) {
        console.error("Error al subir la imagen:", error);
        alert("Error al subir la imagen. Por favor, intenta de nuevo.");
    }
}