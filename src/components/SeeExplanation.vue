<template>
  <v-card>
    <v-container fluid>
      <!-- Text -->
      <template v-if="!isEditing"> 
        <p v-html="expl.html"></p>
      </template>
      <template v-else>
        <TextEditor :injectedHtml="expl.html" ref="TextEditor"/>
        <v-btn @click="updateExplanation()" color="secondary">
          SAVE EDIT
        </v-btn>
      </template>
      
      <!-- Doodle Video -->
      <RenderlessFetchStrokes v-if="expl.thumbnail"
        :strokesRef="strokesRef"
        :imageDownloadUrl="expl.imageUrl"
        v-slot="{ fetchStrokes, strokesArray, imageBlob, isLoading }"
      >
        <div id="doodle-wrapper" :class="isFullScreen ? 'fullscreen-video' : 'video-wrapper'">
            <!-- Thumbnail preview -->
            <template v-if="strokesArray.length === 0 || isLoading">
              <v-img :src="expl.thumbnail" :aspect-ratio="16/9"/>
              <div v-if="expl.hasStrokes" class="overlay-item">
                <v-progress-circular v-if="isLoading" :indeterminate="true" size="50" color="orange"/>
                <v-btn v-else @click="handlePlayClick(fetchStrokes)" large dark>
                  <v-icon>mdi-play</v-icon>
                </v-btn>
              </div>
            </template>
            <!-- Loaded video -->
            <DoodleVideo v-else-if="expl.audioUrl"
              :strokesArray="strokesArray"
              :imageBlob="imageBlob" 
              :audioUrl="expl.audioUrl" 
              @toggle-fullscreen="toggleFullscreen"
              ref="Doodle"
            />
            <DoodleAnimation v-else
              :strokesArray="strokesArray"
              :backgroundUrl="expl.imageUrl"
              @toggle-fullscreen="toggleFullscreen"
              ref="Doodle"
            />
      </div>
      </RenderlessFetchStrokes>

      <!-- Delete popup -->
      <v-dialog v-model="popup" max-width="600px">
        <v-card>
          <v-card-title>Are you sure you want to delete?</v-card-title>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn @click="popup = false">CANCEL</v-btn>
            <v-btn @click="deleteExplanation()">DELETE</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Dropdown menu for editing and deleting -->
      <v-row v-if="user" justify="center">
        <v-layout align-center>
          <p class="pt-3 pl-3 body-2 font-weight-light">
            {{ hasDate ? `By ${expl.creator.firstName}, ${displayDate(expl.date)}` : "" }}
          </p>      
          <p v-if="expl.thumbnail" class="pt-3 pl-2 body-2 font-weight-light">
            (video views: {{ expl.views ? expl.views : 0 }}) 
          </p> 
          <v-spacer></v-spacer>
          <template v-if="expl.creator.uid === user.uid">
            <ButtonNew @click="startEditing()" icon="mdi-pencil">Edit Text</ButtonNew>
            <ButtonNew @click="popup = true" icon="mdi-delete">Delete</ButtonNew>
          </template>
          <ButtonNew @click="upvoteExpl()" :disabled="expl.creator.uid === user.uid">
            Thanks! ({{ expl.upvotersIds ? expl.upvotersIds.length : 0 }})
          </ButtonNew>
        </v-layout>
      </v-row>
    </v-container>
  </v-card>
</template>

<script>
import TextEditor from "@/components/TextEditor.vue";
import DoodleVideo from "@/components/DoodleVideo.vue";
import DoodleAnimation from "@/components/DoodleAnimation.vue";
import RenderlessFetchStrokes from "@/components/RenderlessFetchStrokes";
import ButtonNew from "@/components/ButtonNew.vue"
import db from "@/database.js";
import { displayDate } from "@/helpers.js";
import firebase from "firebase/app";
import "firebase/firestore";

export default {
  props: { 
    expl: Object, 
    hasDate: {
      type: Boolean, 
      default: () => true
    }
  },
  components: { 
    DoodleAnimation,
    DoodleVideo,
    TextEditor,
    RenderlessFetchStrokes,
    ButtonNew
  },
  computed: {
    strokesRef () {
      return db.collection(`${this.expl.ref}/strokes`);
    },
    user () { 
      return this.$store.state.user; 
    }
  },
  data: () => ({ 
    isEditing: false,
    popup: false,
    isFullScreen: false
  }),
  mounted () {
    document.getElementById('doodle-wrapper').addEventListener("click", e=>this.clickOutsideDoodle(e));
  },
  methods: {
    upvoteExpl () {
      const ref = db.doc(`${this.expl.ref}`);
      if (!this.userHasUpvoted()) {
        ref.update({
          upvotersIds: firebase.firestore.FieldValue.arrayUnion(this.user.uid)
        });
      } else {
        ref.update({
          upvotersIds: firebase.firestore.FieldValue.arrayRemove(this.user.uid)
        });
      }
    },
    userHasUpvoted () {
      if (!this.expl.upvotersIds) { return false; }
      return this.expl.upvotersIds.includes(this.user.uid);
    },
    handlePlayClick (fetchStrokes) {
      fetchStrokes();
      // update view count 
      const ref = db.doc(`${this.expl.ref}`);
      ref.update({
        views: firebase.firestore.FieldValue.increment(1)
      });
    },
    displayDate (dateString) { 
      return displayDate(dateString);
    },
    startEditing () {
      this.isEditing = true;
    },
    updateExplanation () {
      const { TextEditor } = this.$refs;
      db.doc(this.expl.ref).update({
        title: TextEditor.extractAllText(),
        html: TextEditor.html
      });
      this.isEditing = false;
    },
    // TODO: should be a recursive deletion
    deleteExplanation () {
      db.doc(this.expl.ref).delete();
      this.popup = false;
    },
    toggleFullscreen () {
      this.isFullScreen = !this.isFullScreen;
      const { Doodle } = this.$refs;
      Doodle.handleResize();
      if (this.isFullScreen) {
        document.documentElement.style.overflowY = "hidden";
      } else {
        document.documentElement.style.overflowY = "auto";
      }
    },
    clickOutsideDoodle (e) {
      if (e.target.id==='doodle-wrapper' && this.isFullScreen) {
        this.toggleFullscreen()
      }
    }
  }
}
</script>

<style scoped>
.overlay-item {
  position: absolute; 
  top: 50%; 
  left: 50%;
  transform: translate(-50%, -50%);
}
.video-wrapper {
  height: 100%; 
  width: 100%; 
  position: relative; 
  z-index: 5; 
  margin: auto;
}
.fullscreen-video {
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  z-index: 10;
  background-color: rgba(0,0,0,0.5);
}
</style>
