
import * as faceapi from 'face-api.js';

export async function loadFaceDetectionModels() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
  } catch (error) {
    console.error('Error loading face detection models:', error);
    throw new Error('Failed to load face detection models');
  }
}

export async function validateFaceImage(imageElement: HTMLImageElement): Promise<boolean> {
  try {
    const detections = await faceapi.detectAllFaces(
      imageElement,
      new faceapi.TinyFaceDetectorOptions()
    ).withFaceLandmarks();

    // Validate that exactly one face is detected
    if (detections.length !== 1) {
      return false;
    }

    // Get the detected face
    const detection = detections[0];
    
    // Validate face size (should take up reasonable portion of image)
    const imageArea = imageElement.width * imageElement.height;
    const faceArea = detection.detection.box.area;
    const faceRatio = faceArea / imageArea;
    
    // Face should take up between 10% and 70% of the image
    if (faceRatio < 0.1 || faceRatio > 0.7) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating face:', error);
    return false;
  }
}
