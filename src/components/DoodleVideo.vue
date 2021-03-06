<template>
  <div ref="VideoWrapper" class="video-container">
    <div ref="CanvasWrapper" style="position: relative;">
      <canvas ref="FrontCanvas" class="front-canvas"></canvas>
      <canvas ref="BackCanvas" class="background-canvas"></canvas>
    </div>
    <audio v-if="audioUrl && strokesArray.length > 0"
      :src="audioUrl" 
      @play="initSyncing()"
      @seeking="syncStrokesToAudio()"
      ref="AudioPlayer" 
      style="width: 100%;"
      controls
    />
    <div id="extra-controls">
      <v-btn @click="$emit('toggle-fullscreen')"><v-icon>mdi-fullscreen</v-icon></v-btn>
      <v-col cols="auto" class="px-0 py-0">
        <v-select
          :items="speedOptions"
          :value="playbackSpeed"
          @input="changePlaybackSpeed"
          dense
          solo
          background-color="rgba(255,255,255,0.75)"
          :hide-details="true"
          class="my-0"
          color="accent"
          item-color="accent"
        >
          <v-icon slot="append" color="black" small>mdi-fast-forward</v-icon>
        </v-select>
      </v-col>
    </div>
  </div>
</template>

<script>
import CanvasDrawMixin from "@/mixins/CanvasDrawMixin.js";
import _ from "lodash";
import { navbarHeight, audioPlayerHeight, aspectRatio } from "@/CONSTANTS.js";

export default {
  props: {
    strokesArray: {
      type: Array,
      required: true
    },
    audioUrl: {
      type: String,
      required: true
    },
    imageBlob: Blob // a File is also a Blob
  },
  mixins: [
    CanvasDrawMixin
  ],
  data: () => ({
    playbackSpeed: 1,
    speedOptions: [{text:'0.5x', value: 0.5},{text:'1x', value: 1},{text:'1.5x', value: 1.5},{text:'2x', value: 2},{text:'3x', value: 3}],
    canvas: null,
    ctx: null,
    bgCanvas: null,
    bgCtx: null,
    nextFrameIdx: 0, 
    recursiveSyncer: null
  }),
  computed: {
    imageBlobUrl () {
      if (this.imageBlob) {
        return URL.createObjectURL(this.imageBlob);
      } else {
        return "";
      }
    },
    /* Converts separate strokes into continuous points */
    allFrames () {
      const allPoints = [];
      for (let i = 0; i < this.strokesArray.length; i++) {
        for (let j = 1; j < this.strokesArray[i].points.length; j++) {
          const frame = { strokeIndex: i, pointIndex: j };
          allPoints.push({ 
            startTime: this.getStartTime(frame),
            ...frame, 
          }); 
        }
      }
      return allPoints.sort((p1, p2) => p1.startTime - p2.startTime);
    }
  },
  async created () {
    // this.handleResize = _.debounce(this.handleResize, 100); 
  },
  async mounted () {
    this.canvas = this.$refs.FrontCanvas;
    this.bgCanvas = this.$refs.BackCanvas;
    this.ctx = this.canvas.getContext("2d");
    this.bgCtx = this.bgCanvas.getContext("2d");
    await this.handleResize();
    this.handleResize = _.debounce(this.handleResize, 100); 
    window.addEventListener("resize", this.handleResize);
  },
  beforeDestroy () {
    // quickfix for the previous recordings playing bug on iOS
    const { AudioPlayer } = this.$refs;
    AudioPlayer.src = "";
    window.removeEventListener("resize", this.handleResize);
  },
  methods: {
    changePlaybackSpeed (speed) {
      this.playbackSpeed = speed
      this.$refs.AudioPlayer.playbackRate = speed;
    },
    playAudio () {
      this.$refs.AudioPlayer.play();
    },
    // TODO: touch to play or pause
    getStartTime ({ strokeIndex, pointIndex }) {
      const stroke = this.strokesArray[strokeIndex];
      return stroke.startTime + (pointIndex - 1) * this.$_getPointDuration(stroke);
    },
    handleResize () {
      return new Promise(async (resolve) => {
        this.resizeVideo();
        this.$_rescaleCanvas();
        if (this.recursiveSyncer) {
          // video was playing: resume to previous progress
          this.nextFrameIdx = 0;
          this.syncStrokesToAudio();
        } else {
          this.$_drawStrokesInstantly();
        }
        resolve();
      })
    },
    resizeVideo () {
      const { CanvasWrapper, VideoWrapper } = this.$refs;
      VideoWrapper.style.width = "100%";
      const availableWidth = VideoWrapper.offsetWidth; 
      const availableHeight = window.innerHeight - navbarHeight - audioPlayerHeight;
      let videoHeight; 
      let videoWidth; 

      if (availableWidth * aspectRatio < availableHeight) {
        videoWidth = availableWidth;
        videoHeight = videoWidth * aspectRatio;
      } else {
        videoHeight = availableHeight;
        videoWidth = videoHeight * (1/aspectRatio);
      }

      CanvasWrapper.style.height = `${videoHeight}px`;
      this.canvas.style.height = `${videoHeight}px`;
      this.bgCanvas.style.height = `${videoHeight}px`;
      VideoWrapper.style.width = `${videoWidth}px`;
    },
    initSyncing () {
      this.nextFrameIdx = 0;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // video could already be rendered as an initial preview or completed video
      this.syncRecursively();
    },
    syncRecursively () {
      const { AudioPlayer } = this.$refs;
      if (!AudioPlayer) return;
      this.syncStrokesToAudio();
      if (this.nextFrameIdx < this.allFrames.length) {
        // calculate sleep duration
        const nextFrame = this.allFrames[this.nextFrameIdx];
        const timeTilNextStroke = 1000 * (nextFrame.startTime - AudioPlayer.currentTime); 
        this.recursiveSyncer = setTimeout(this.syncRecursively, timeTilNextStroke/this.playbackSpeed); // use recursion instead of `setInterval` to prevent overlapping calls
      }
    },
    syncStrokesToAudio () {
      const { AudioPlayer } = this.$refs;
      if (!AudioPlayer) return;
      const nextFrame = this.allFrames[this.nextFrameIdx];
      if (!nextFrame || nextFrame.startTime > AudioPlayer.currentTime) { // !nextFrame: nextFrame is undefined after a video finishes
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.nextFrameIdx = 0;
      }
      this.renderFramesUntilCurrentTime();
    },
    renderFramesUntilCurrentTime () {
      const { currentTime } = this.$refs.AudioPlayer;
      for (let i = this.nextFrameIdx; i < this.allFrames.length; i++) {
        const frame = this.allFrames[i];
        if (frame.startTime > currentTime) { 
          break; 
        }
        this.renderFrame(frame);
        this.nextFrameIdx += 1;
      }
    },
    renderFrame ({ strokeIndex, pointIndex }) {
      const stroke = this.strokesArray[strokeIndex];
      this.$_setStyle(stroke.color, stroke.lineWidth); // since multiple strokes can be drawn simultaneously.
      this.$_connectTwoPoints(stroke.points, pointIndex, stroke.isErasing);
    }
  }
}
</script>

<style scoped>
.video-container {
  margin: auto;
  position: relative;
}
.doodle-video {
  height: 100%; 
  width: 100%;
  position: relative; 
  z-index: 5; 
  margin: auto;
}
.canvas-wrapper {
  width: 100%;
  height: 100%; 
  position: relative;
}
.front-canvas {
  width: 100%; 
  height: 1; 
  background-color: transparent; 
  display: block;
}
.background-canvas {
  /* absolute places the background relative to the parent and ignore the front canvas, thereby stacking on top of each other */
  position: absolute; 
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  background-color: rgb(62, 66, 66);
}
#extra-controls {
  position: absolute;
  top: 10px;
  left: 10px;
  width: calc(100% - 20px);
  opacity: 0.75;
  display: flex;
  justify-content: space-between;
}
#extra-controls > * {
  opacity: 0.8;
}
#extra-controls > *:hover {
  opacity: 1;
}
</style>
<style>
#extra-controls .v-select__selections {
  color: accent;
}
</style>