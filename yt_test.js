const axios = require("axios");

async function getYoutubeDuration(url) {
  try {
    const { data } = await axios.get(url);
    // Try to find lengthSeconds in ytInitialPlayerResponse
    const match = data.match(/"lengthSeconds":"(\d+)"/);
    if (match && match[1]) {
      const durationInSeconds = parseInt(match[1], 10);
      const minutes = Math.floor(durationInSeconds / 60);
      const seconds = Math.floor(durationInSeconds % 60);
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    // Try meta tag
    const metaMatch = data.match(/itemprop="duration" content="([^"]+)"/);
    if (metaMatch && metaMatch[1]) {
      // PT#M#S
      let durationStr = metaMatch[1]; // e.g., PT3M33S
      let minutes = 0;
      let seconds = 0;
      const minMatch = durationStr.match(/(\d+)M/);
      if (minMatch) minutes = parseInt(minMatch[1], 10);
      const secMatch = durationStr.match(/(\d+)S/);
      if (secMatch) seconds = parseInt(secMatch[1], 10);

      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return "00:00";
  } catch (err) {
    console.error("Error fetching youtube:", err.message);
    return "00:00";
  }
}

getYoutubeDuration("https://www.youtube.com/watch?v=dQw4w9WgXcQ").then(
  console.log,
);
