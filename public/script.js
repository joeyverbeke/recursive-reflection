let isRunning = false; // Tracks whether the loop is running
let imageIteration = 0; // Tracks the latest displayed image
let eventSource; // For server-sent events

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

            // Start listening for new images
            listenForNewImages();
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

            // Stop listening for new images
            if (eventSource) {
                eventSource.close();
            }
        } catch (error) {
            console.error("Error:", error);
            logBox.innerHTML = "<p>Error stopping reflection.</p>";
        }
    }
}

// **Listen for new images from the server using Server-Sent Events (SSE)**
function listenForNewImages() {
    const imagesBox = document.getElementById("images");

    eventSource = new EventSource("/image-stream");

    eventSource.onmessage = function (event) {
        const newImage = event.data;
        console.log("New image received:", newImage);

        // Update image display
        imagesBox.innerHTML = `<img src="${newImage}" alt="Generated Image" style="max-width: 100%; border-radius: 10px; margin-top: 10px;">`;
    };

    eventSource.onerror = function () {
        console.log("Stopped listening for images.");
        eventSource.close();
    };
}
