let isRunning = false; // Tracks whether the loop is running
let imageIteration = 0; // Tracks the latest displayed image
let firstImageGenerated = false; // Ensures the first image is only shown after it's created

async function toggleReflection() {
    const promptInput = document.getElementById("initialPrompt");
    const logBox = document.getElementById("log");
    const button = document.getElementById("toggleButton");

    if (!isRunning) {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            logBox.innerHTML = "<p>Please enter a starting prompt.</p>";
            return;
        }

        logBox.innerHTML = "<p>Starting reflection...</p>";

        try {
            await fetch("/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });

            logBox.innerHTML = "<p>Infinite reflection started.</p>";
            button.textContent = "Stop";
            isRunning = true;
            firstImageGenerated = false; // Reset tracking for new start

            // Start polling for images
            pollForNewImages();
        } catch (error) {
            console.error("Error:", error);
            logBox.innerHTML = "<p>Error starting reflection.</p>";
        }
    } else {
        logBox.innerHTML = "<p>Stopping reflection...</p>";

        try {
            await fetch("/stop", { method: "POST" });

            logBox.innerHTML = "<p>Infinite reflection stopped.</p>";
            button.textContent = "Start";
            isRunning = false;
        } catch (error) {
            console.error("Error:", error);
            logBox.innerHTML = "<p>Error stopping reflection.</p>";
        }
    }
}

// Poll for new images every 5 seconds
async function pollForNewImages() {
    const imagesBox = document.getElementById("images");

    while (isRunning) {
        try {
            // Construct the latest image path
            const newImage = `/images/generated_${imageIteration}.png`;

            // Check if the image exists
            const response = await fetch(newImage, { method: "HEAD" });

            if (response.ok) {
                // Ensure the first image is not displayed until it's actually generated
                if (!firstImageGenerated) {
                    firstImageGenerated = true;
                }

                // Update the image container instead of appending images
                imagesBox.innerHTML = `<img src="${newImage}" alt="Generated Image" style="max-width: 100%; border-radius: 10px; margin-top: 10px;">`;

                imageIteration++; // Increment for the next image
            }
        } catch (error) {
            console.error("Error fetching images:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before polling again
    }
}
