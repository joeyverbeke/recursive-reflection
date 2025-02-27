const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const OLLAMA_URL = "http://localhost:11434/api/generate"; // Ollama API for DeepSeek & LLaVA
const STABLE_DIFFUSION_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img"; // Stable Diffusion API

const MODEL_LLM = "deepseek-r1:8b-llama-distill-q4_K_M"; // Correct DeepSeek model
const MODEL_LLaVA = "llava"; // Multimodal model

let running = false;
let iteration = 0;
let originalPrompt = ""; // Holds the original user prompt
const clients = []; // Store connected clients for SSE
const LOG_FILE_PATH = "ai_thoughts_log.txt"; // Single log file for all runs

function logAIThoughts(iteration, originalPrompt, deepseekRawThoughts, deepseekFinalPrompt, llavaAnalysis) {
    const timestamp = new Date().toISOString();
    const logEntry = `\n--- [Session Start: ${timestamp}] ---
Original Prompt: ${originalPrompt}

[Iteration ${iteration}]
- DeepSeek Raw Thoughts: ${deepseekRawThoughts || "N/A"}
- DeepSeek Final Prompt: ${deepseekFinalPrompt}
- LLaVA Analysis: ${llavaAnalysis}

------------------------------\n`;

    fs.appendFileSync(LOG_FILE_PATH, logEntry, "utf8");
    console.log(`📝 Logged Iteration ${iteration} to ${LOG_FILE_PATH}`);
}


// **Function to clean DeepSeek response**
function cleanDeepSeekResponse(responseText) {
    // Remove <think>...</think> if it exists
    const removedText = responseText.match(/<think>[\s\S]*?<\/think>/g);
    if (removedText) {
        console.log("AI thoughts:", removedText.join(" "));
    }
    return responseText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

let deepseekContext = []; // Stores past reflections

async function generateReflection(currentReflection) {
    try {
        console.log(`Iteration ${iteration}: Generating reflection with DeepSeek...`);

        // **Update DeepSeek memory with past reflections**
        deepseekContext.push(currentReflection);
        if (deepseekContext.length > 5) {
            deepseekContext.shift();
        }

        const response = await axios.post(OLLAMA_URL, {
            model: MODEL_LLM,
            prompt: `You are recursively iterating on an image, given the initial prompt of: "${originalPrompt}".
            \nYou are given this elaborate and detailed description of the current image: "${currentReflection}".
            \nYour past reflections on previous iterations include: "${deepseekContext.join(" ")}"
            \nYour purpose is to critically reflect on the description of this image and think about how to iterate on it.
            \nThink very deeply about how to move forward, whether this is the right "direction". Your reflection should be very holistic and critical about the nature of what is trying to be represented.
            \nIMPORTANT: Your response should be in the form of a Stable Diffusion prompt, nothing else, ONLY the prompt. The prompt should include tags and language specific to Stable Diffusion to ensure the right style of image is generated. This will directly be sent to Stable Diffusion to generate the next image.`,
            stream: false,
        });

        let rawThoughts = response.data.response.trim(); // Capture full DeepSeek output
        let finalPrompt = cleanDeepSeekResponse(rawThoughts); // Remove <think> tags

        //console.log(`Iteration ${iteration}: Raw Thoughts:\n${rawThoughts}`);
        console.log(`Iteration ${iteration}: Cleaned Reflection:\n${finalPrompt}`);

        return { rawThoughts, finalPrompt }; // Return both raw and cleaned data
    } catch (error) {
        console.error("Error generating reflection:", error.message);
        return { rawThoughts: "Error in AI processing.", finalPrompt: "Unexpected anomalies. Further reflection needed." };
    }
}



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

        // **Generate a unique filename using a timestamp**
        const timestamp = Date.now();
        const filePath = `${imageDir}/generated_${iteration}_${timestamp}.png`;
        fs.writeFileSync(filePath, imageBuffer);

        console.log(`Iteration ${iteration}: Image saved: ${filePath}`);
        return `/images/generated_${iteration}_${timestamp}.png`; // Return the new unique filename
    } catch (error) {
        console.error("Error generating image:", error.message);
        return null;
    }
}

// **Function to analyze an image using LLaVA**
async function analyzeImage(imagePath) {
    try {
        console.log(`Iteration ${iteration}: Analyzing image with LLaVA...`);

        // Convert image to base64
        const imageBuffer = fs.readFileSync(`public${imagePath}`);
        const imageBase64 = imageBuffer.toString("base64");

        const payload = {
            model: MODEL_LLaVA,
            prompt: `You are part of a recursive image generation system, iterating on an initial idea.
            \nThe original concept to contemplate is: "${originalPrompt}".
            \nYour task is to analyze this image and provide a structured breakdown.
            \n**Describe the image's composition in precise detail.**
            \n**Identify key elements, textures, lighting, and color schemes.**
            \n**Critically assess how this image compares to the original concept.**
            \n**Suggest improvements for the next iteration. What aspects should change? What is missing?**
            \nYour analysis should be highly detailed and relevant to guiding the next recursive iteration.`,
            images: [imageBase64], // Corrected image format
            stream: false,
        };

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
async function processIteration(currentReflection) {
    console.log(`\n=== Iteration ${iteration} ===`);

    // **Step 1: Generate a reflection (DeepSeek)**
    const { rawThoughts, finalPrompt } = await generateReflection(currentReflection);

    // **Step 2: Generate an image (Stable Diffusion)**
    const imagePath = await generateImage(finalPrompt);
    if (!imagePath) {
        console.error("Image generation failed. Stopping process.");
        running = false;
        return;
    }

    // **Step 3: Analyze the image (LLaVA)**
    const analysis = await analyzeImage(imagePath);

    // **Log AI thoughts per iteration**
    logAIThoughts(iteration, originalPrompt, rawThoughts, finalPrompt, analysis);

    // **Step 4: Reflect on the analysis (DeepSeek)**
    const newReflection = await generateReflection(analysis);
    iteration++;

    // **Repeat the loop with the new reflection**
    if (running) {
        setTimeout(() => processIteration(newReflection.finalPrompt), 5000);
    }
}


// **Start the infinite loop**
app.post("/start", async (req, res) => {
    const { prompt } = req.body;

    if (running) {
        return res.json({ message: "Reflection is already running." });
    }

    console.log("🟢 Starting infinite reflection loop...");
    running = true;
    iteration = 0;
    originalPrompt = prompt; // Store the original user-entered prompt

    clearOldImages(); // Delete old images before starting a new session
    processIteration(prompt);

    res.json({ message: "Infinite reflection started." });
});

app.post("/stop", (req, res) => {
    running = false;
    originalPrompt = ""; // Reset the original prompt
    iteration = 0; // Reset iteration counter
    deepseekContext = []; // Clear past reflections

    // **Clear all connected SSE clients**
    clients.forEach((client) => client.end());
    clients.length = 0; // Empty the clients array

    console.log("🛑 Infinite reflection loop fully stopped. Memory cleared.");
    res.json({ message: "Infinite reflection fully stopped." });
});



// **Function to clear all old images when a new session starts**
function clearOldImages() {
    const imageDir = "public/images";

    if (fs.existsSync(imageDir)) {
        fs.readdirSync(imageDir).forEach(file => {
            if (file.startsWith("generated_") && file.endsWith(".png")) {
                fs.unlinkSync(path.join(imageDir, file)); // Delete each image
            }
        });
        console.log("🗑️ Cleared old images before starting new session.");
    }
}

// **Watch for new images in the /public/images/ directory**
if (!fs.existsSync("public/images")) {
    fs.mkdirSync("public/images", { recursive: true });
}

fs.watch("public/images", (eventType, filename) => {
    if (eventType === "rename" && filename.startsWith("generated_") && filename.endsWith(".png")) {
        const imagePath = `/images/${filename}`;
        console.log("New image detected:", imagePath);

        // Send update to all clients
        clients.forEach((res) => res.write(`data: ${imagePath}\n\n`));
    }
});

// **SSE Route: Stream New Image Events to Frontend**
app.get("/image-stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    clients.push(res);

    req.on("close", () => {
        clients.splice(clients.indexOf(res), 1);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
