const ffmpeg = require("fluent-ffmpeg");
const ffprobeStatic = require("ffprobe-static");

ffmpeg.setFfprobePath(ffprobeStatic.path);

const videoUrl = "https://www.w3schools.com/html/mov_bbb.mp4"; // sample video

ffmpeg.ffprobe(videoUrl, function (err, metadata) {
  if (err) {
    console.error("Error:", err);
  } else {
    const durationInSeconds = metadata.format.duration;
    console.log("Duration in seconds:", durationInSeconds);

    // Format to MM:SS
    const minutes = Math.floor(durationInSeconds / 60);
    const seconds = Math.floor(durationInSeconds % 60);
    const formattedDuration = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    console.log("Formatted Duration:", formattedDuration);
  }
});
