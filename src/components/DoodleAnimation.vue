<template>
  <div ref="VideoWrapper" class="video-container">
    <div ref="CanvasWrapper" style="position: relative;">
      <canvas ref="FrontCanvas" class="front-canvas"></canvas>
      <canvas ref="BackCanvas" class="background-canvas"></canvas>
    </div>
    <div class="d-flex animation-controls">
      <v-col cols="auto" class="px-1">
        <v-btn @click="pausePlay()" color="accent" text>
          <v-icon>{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
        </v-btn>
      </v-col>
      <v-col class="px-1">
        <v-slider
          color="accent"
          track-color="rgba(0,0,0,0.30)"
          :value="Math.max(currentFrameIdx,0)" 
          :max="allFrames.length"
          @input="(newVal) => seek(newVal)"
          @change="(newVal) => finishSeek(newVal)"
          :hide-details="true"
        />
      </v-col>
      <v-col cols="auto" class="px-0">
        <v-select
         :items="speedOptions"
         v-model="playbackSpeed"
         dense
         solo
         background-color="#f5f5f5"
         flat
         hide-details
         class="my-0"
         menu-props="top"
         color="accent"
         item-color="accent"
        >
          <v-icon slot="append" color="accent lighten-2" small>mdi-fast-forward</v-icon>
        </v-select>
      </v-col>
      <v-col cols="auto" class="px-1">
        <v-btn text @click="$emit('toggle-fullscreen')" color="accent"><v-icon>mdi-fullscreen</v-icon></v-btn>
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
    strokesArray: Array,
    backgroundUrl: String
  },
  mixins: [CanvasDrawMixin],
  data: () => ({
    currentFrameIdx: -1,
    isPlaying: true,
    isSeeking: false,
    playbackSpeed: 1,
    speedOptions: [{text:'0.5x', value: 0.5},{text:'1x', value: 1},{text:'2x', value: 2},{text:'4x', value: 4},{text:'8x', value: 8}],
    playerCount: 0, // Tracks the number of players existing concurrently to remove all previous instance of players
    canvas: null,
    ctx: null,
    bgCanvas: null,
    bgCtx: null,
  }),
  computed: {
    /* Converts separate strokes into continuous points */
    allFrames () {
      const allPoints = [];
      for (let i = 0; i < this.strokesArray.length; i++) {
        for (let j = 1; j < this.strokesArray[i].points.length; j++) {
          const frame = { strokeIndex: i, pointIndex: j };
          allPoints.push(frame);
        }
      }
      return allPoints;
    }
  },
  async mounted () {
    this.canvas = this.$refs.FrontCanvas;
    this.bgCanvas = this.$refs.BackCanvas;
    this.ctx = this.canvas.getContext("2d");
    this.bgCtx = this.bgCanvas.getContext("2d");
    await this.handleResize();
    this.playAnimation();
    // if I put the below line before playAnimation then the debounce will mess up the await 
    this.handleResize = _.debounce(this.handleResize, 100); 
    window.addEventListener("resize", this.handleResize);
  },
  beforeDestroy () {
    window.removeEventListener("resize", this.handleResize);
  },
  methods: {
    handleResize () {
      return new Promise(async (resolve) => {
        this.resizeVideo();
        this.$_rescaleCanvas();
        await this.renderBackground();
        this.syncAnimation();
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
    renderBackground () {
      return new Promise((resolve) => {
        if (!this.backgroundUrl) resolve();
        const image = new Image();
        image.src = this.backgroundUrl;
        this.bgCanvas.width = this.canvas.width;
        this.bgCanvas.height = this.canvas.height;
        const { width, height } = this.bgCanvas;
        image.onload = () => {
          this.bgCtx.drawImage(image, 0, 0, width, height);
          resolve();
        } 
      });
    },
    seek (frameIndex) {
      this.currentFrameIdx = frameIndex;
      this.isSeeking = true;
      this.syncAnimation();
      // just preview the canvas upto frame frameIndex without playing as the user seeks through before releasing the mouse button
    },
    finishSeek (frameIndex) {
      // start playing after the user releases the mouse button after seeking
      this.isSeeking = true;
      setTimeout(()=> {
        this.currentFrameIdx = frameIndex;
        this.isSeeking = false;
        this.playAnimation();
        }, 0
      )
    },
    pausePlay () {
      this.isPlaying = !this.isPlaying;
      if (this.isPlaying) this.playAnimation();
    },
    speedChange (newSpeed) {
      this.playbackSpeed = newSpeed;
    },
    async playAnimation () {
      if (this.isPlaying) {
        this.playerCount += 1 // Increase the total count of the instances of players
      }
      const currentPlayer = this.playerCount; // The ID of the current instance of the player
      let playBreak = false; // If the current instance of player breaks out of loop before completion
      await this.syncAnimation();
      for (let i = this.currentFrameIdx+1; i < this.allFrames.length; i++) {
        if (!this.isPlaying || this.isSeeking || this.playerCount!==currentPlayer) {
          // Break the loops i.e., don't play the current instance when paused, or user is seeking, 
          // or when the instance of the player is not the latest
          playBreak = true;
          break;
        }
        if (i % 10 === 0) { this.currentFrameIdx = i; }
        await this.renderFrame(this.allFrames[i], false); // draw 1 stroke per event loop
      }
      if (!playBreak) { // We can't check if the currentFrameIdx is the last last frame as we increment it only every 10 frames
        // Initialize the player to the initial state when finished
        this.currentFrameIdx = 0;
        this.isPlaying = false;
      }
    },
    async syncAnimation () {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (let i = 0; i <= this.currentFrameIdx; i++) {
        await this.renderFrame(this.allFrames[i], true); // draw 1 stroke per event loop
      }
    },
    async renderFrame ({ strokeIndex, pointIndex }, instantly=false) {
      const stroke = this.strokesArray[strokeIndex];
      this.$_setStyle(stroke.color, stroke.lineWidth); // since multiple strokes can be drawn simultaneously.
      this.$_connectTwoPoints(stroke.points, pointIndex, stroke.isErasing);
      if (!instantly) {
        await new Promise(resolve => setTimeout(resolve, 10/this.playbackSpeed)); // Here the second parameter 10/this.playbackSpeed determines the number of frames rendered per second
      }
    },
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
.animation-controls {
  background: #eee;
  border-bottom-right-radius: 10px;
  border-bottom-left-radius: 10px;
}
</style>
<style>
.v-select .v-select__selections input {
  width: 0;
}
</style>
