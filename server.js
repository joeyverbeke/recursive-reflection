const express = require("express");
const axios = require("axios");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const OLLAMA_URL = "http://localhost:11434/api/generate"; // Ollama API for DeepSeek & LLaVA
const STABLE_DIFFUSION_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img"; // Stable Diffusion API

const MODEL_LLM = "deepseek-r1:8b-llama-distill-q4_K_M"; // Reasoning model
const MODEL_LLaVA = "llava"; // Multimodal model

let running = false;
let iteration = 0;

// Function to generate a Stable Diffusion prompt using DeepSeek
async function generateReflection(prompt) {
    try {
        console.log(`Iteration ${iteration}: Generating reflection with DeepSeek...`);
        const response = await axios.post(OLLAMA_URL, {
            model: MODEL_LLM,
            prompt: `Critically reflect on this concept and generate an idea for an image: "${prompt}"`,
            stream: false,
        });

        const reflection = response.data.response.trim();
        console.log(`Iteration ${iteration}: Reflection generated:\n${reflection}`);
        return reflection;
    } catch (error) {
        console.error("Error generating reflection:", error.message);
        return "Unexpected anomalies. Further reflection needed.";
    }
}

// Function to generate an image using Stable Diffusion
async function generateImage(prompt) {
    try {
        console.log(`Iteration ${iteration}: Generating image from Stable Diffusion...`);

        const response = await axios.post(STABLE_DIFFUSION_URL, {
            prompt: prompt,
            steps: 20,
            cfg_scale: 7,
            width: 512,
            height: 512,
            sampler_name: "Euler a",
        });

        const imageBase64 = response.data.images[0];
        const imageBuffer = Buffer.from(imageBase64, "base64");

        // Ensure the /public/images directory exists
        const imageDir = "public/images";
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }

        const filePath = `${imageDir}/generated_${iteration}.png`;
        fs.writeFileSync(filePath, imageBuffer);

        console.log(`Iteration ${iteration}: Image saved: ${filePath}`);
        return `/images/generated_${iteration}.png`;
    } catch (error) {
        console.error("Error generating image:", error.message);
        return null;
    }
}

// Function to analyze an image using LLaVA
async function analyzeImage(imagePath) {
    try {
        console.log(`Iteration ${iteration}: Analyzing image with LLaVA...`);

        // Convert image to base64
        const imageBuffer = fs.readFileSync(`public${imagePath}`);
        const imageBase64 = imageBuffer.toString("base64");

        // Send request to LLaVA with proper JSON structure
        const payload = {
            model: MODEL_LLaVA,
            prompt: "Describe this image in detail. Identify patterns, themes, or anomalies.",
            images: [imageBase64], // LLaVA supports an array of images
            stream: false,
        };

        // Send request to LLaVA
        const response = await axios.post(OLLAMA_URL, payload, {
            headers: { "Content-Type": "application/json" },
        });

        const analysis = response.data.response.trim();
        console.log(`Iteration ${iteration}: LLaVA Analysis:\n${analysis}`);
        return analysis;
    } catch (error) {
        console.error("Error analyzing image with LLaVA:", error.message);
        return "Unable to analyze image. Unexpected anomalies detected.";
    }
}

// **Sequential Execution of Reflection, Generation, and Analysis**
async function processIteration(prompt) {
    console.log(`\n=== Iteration ${iteration} ===`);

    // **Step 1: Generate a reflection (DeepSeek)**
    const reflection = await generateReflection(prompt);

    // **Step 2: Generate an image (Stable Diffusion)**
    const imagePath = await generateImage(reflection);
    if (!imagePath) {
        console.error("Image generation failed. Stopping process.");
        running = false;
        return;
    }

    // **Step 3: Analyze the image (LLaVA)**
    const analysis = await analyzeImage(imagePath);

    // **Step 4: Reflect on the analysis (DeepSeek)**
    const newReflection = await generateReflection(analysis);

    iteration++;

    // **Repeat the loop with the new reflection**
    if (running) {
        setTimeout(() => processIteration(newReflection), 5000); // Delay to prevent overload
    }
}

// **Start the infinite loop**
app.post("/start", async (req, res) => {
    const { prompt } = req.body;

    if (running) {
        return res.json({ message: "Reflection is already running." });
    }

    console.log("Starting infinite reflection loop...");
    running = true;
    iteration = 0;
    
    processIteration(prompt);

    res.json({ message: "Infinite reflection started." });
});

// **Stop the loop**
app.post("/stop", (req, res) => {
    running = false;
    console.log("Infinite reflection loop stopped.");
    res.json({ message: "Infinite reflection stopped." });
});

// **Serve images correctly**
app.use("/images", express.static("public/images"));

// **API to fetch the latest images**
app.get("/generated_images", (req, res) => {
    const imageDir = "public/images";
    
    if (!fs.existsSync(imageDir)) {
        return res.json([]);
    }

    const imagePaths = fs.readdirSync(imageDir)
        .filter(file => file.startsWith("generated_") && file.endsWith(".png"))
        .map(file => `/images/${file}`);

    res.json(imagePaths);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
