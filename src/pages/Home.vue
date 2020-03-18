<template>
  <div id="home-page">
    <TheAppBar>
      <template v-if="user">
        <!-- target="_blank" opens a new tab -->
        <!-- <v-btn href="https://medium.com/@eltonlin1998/feynman-overview-338034dcb426" text color="accent" target="_blank">   
          BLOG
        </v-btn> -->

          <!-- <v-btn href="https://github.com/eltonlin1998/ExplainMIT" target="_blank" color="accent" tile icon>
            <v-icon>mdi-git</v-icon>
          </v-btn> -->
        <a href="https://github.com/eltonlin1998/ExplainMIT" target="_blank">
          <ButtonNew icon="mdi-git" href="https://github.com/eltonlin1998/ExplainMIT">Github</ButtonNew>
        </a>
        <BasePopupButton 
          actionName="Create class" 
          @action-do="(C) => createClass(C)"
          :inputFields="['class name', 'class description']"
        >
          <template v-slot:activator-button="{ on }">
            <ButtonNew v-on="on" icon="mdi-plus">Add Class</ButtonNew>
          </template>
        </BasePopupButton>
        <TheDropdownMenu @sign-out="signOut()" @settings-changed="(S) => updateSettings(S)">
          <template v-slot:default="{ on }">
            <ButtonNew v-on="on" :filled="true" icon="mdi-settings">Settings</ButtonNew>
          </template>
        </TheDropdownMenu>
      </template>
    </TheAppBar>
    <v-content>
      <transition name="fade">
        <v-card v-if="!isFetchingUser" fluid class="mx-auto text-center">
          <v-container>
            <div class="central-title d-flex justify-center align-center mb-4">
              <img src="/logo.png" class="hero-img"/>
              <h1 class="text--primary ml-2">ExplainMIT</h1>
            </div>
            <h3 class="headline text--primary">
              A prototype for lightweight visual explanations
            </h3>

            <!-- Log in / Sign up -->
            <v-row class="my-5" justify="center">
              <template v-if="!user">
                <v-col cols="auto">
                  <BasePopupButton 
                    actionName="Log in" 
                    :inputFields="['email', 'password']" 
                    @action-do="user => logIn(user)"
                  />
                </v-col>
                <v-col cols="auto">
                  <BasePopupButton 
                    actionName="Sign up" 
                    :inputFields="['first name', 'last name', 'email', 'password']" 
                    @action-do="user => signUp(user)"
                    outlined
                  >
                    <template v-slot:message-to-user>
                      Passwords are handled by Google Firebase Authentication.
                    </template>
                  </BasePopupButton>
                </v-col>
              </template>
              <!-- Search Bar -->
              <template v-else>
                <v-col cols="12" sm="6">
                  <TheSearchBar 
                    :items="schoolClasses"
                    @submit="payload => enrollInClass(payload)" 
                    color="accent"
                  />
                </v-col>
              </template>
            </v-row>
          </v-container>
        </v-card>
      </transition>
      <v-container fluid>
        <!-- Class security popup -->
        <v-dialog v-model="classSecurityPopup" max-width="600px">
          <v-card>
            <v-card-title>Please enter the class password</v-card-title>
            <v-card-text>
              <v-text-field v-model="classPassword"/>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn @click="classSecurityPopup = false">CANCEL</v-btn>
              <v-btn @click="handleClassPassword()">SUBMIT</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Tutorial -->
        <div v-if="!user && !isFetchingUser">
          <SeeExplanation :expl="demoVideo" :hasDate="false"/>
          <CreateExplanation/>
        </div>

        <!-- Classes -->
        <div v-else-if="user" key="class-list">
          <v-row align="stretch" class="enrolled-classes">
            <v-col v-for="C in user.enrolledClasses" cols="12" sm="4" md="3" :key="C.id">
              <AsyncRenderless :dbRef="getMitClassRef(C.id)">
                <template slot-scope="{ fetchedData: C }">
                  <transition name="fade">
                    <v-card v-if="C.name && C.description" @click="handleClassClick(C.id, C.name)">
                      <v-card-title class="title">{{ C.name }}</v-card-title>
                      <v-card-subtitle>{{ C.description }}</v-card-subtitle>
                    </v-card>
                  </transition>
                </template>
              </AsyncRenderless>
            </v-col>
          </v-row>
        </div>
      </v-container>           
    </v-content>
  </div>
</template>

<script>
import { mapState } from "vuex";
import firebase from "firebase/app";
import "firebase/auth";
import db from "@/database.js";
import TheAppBar from "@/components/TheAppBar.vue";
import TheDropdownMenu from "@/components/TheDropdownMenu.vue";
import TheSearchBar from "@/components/TheSearchBar.vue";
import AsyncRenderless from "@/components/AsyncRenderless.vue";
import BasePopupButton from "@/components/BasePopupButton.vue";
import DatabaseHelpersMixin from "@/mixins/DatabaseHelpersMixin.js";
import Blackboard from "@/components/Blackboard.vue";
import SeeExplanation from "@/components/SeeExplanation.vue";
import CreateExplanation from "@/components/CreateExplanation.vue";
import { demoVideo, NotifFrequency } from "@/CONSTANTS.js";
import ButtonNew from "@/components/ButtonNew.vue";

export default {
  components: {
    AsyncRenderless, 
    BasePopupButton,
    Blackboard,
    SeeExplanation,
    CreateExplanation,
    TheAppBar,
    TheDropdownMenu,
    TheSearchBar,
    ButtonNew
  },
  mixins: [DatabaseHelpersMixin],
  computed: {
    ...mapState(["user", "isFetchingUser"]),
    userRef () { 
      return db.collection("users").doc(this.user.uid); 
    }
  },
  data () {
    return {
      schoolClasses: [],
      demoVideo: { creator: {} },
      welcomeMessage: "Welcome to ExplainMIT! You can configure email settings on the top right.",
      classSecurityPopup: false,
      classPassword: "",
      attemptToJoinClassId: ""
    }
  },
  async created () { 
    this.fetchClasses(); 
    const demoVideoRef = this.getBlackboardRef(demoVideo.postId);
    this.demoVideo = await this.$_getDoc(demoVideoRef); 
  },
  mounted () { 
    window.addEventListener("scroll", this.logoVisibility); 
  },
  destroyed () { 
    window.removeEventListener("scroll", this.logoVisibility); 
  },
  methods: {
    handleClassPassword () {
      if (["explainphysics", "physics"].includes(this.classPassword.toLowerCase())) {
        this.$router.push(`class/${this.attemptToJoinClassId}`);
        this.$root.$emit("show-snackbar", "Success.");
      } else {
        this.$root.$emit("show-snackbar", "Incorrect password.")
      }
      this.classPassword = "";
      this.classSecurityPopup = false;
    },
    handleClassClick (classId, className) {
      if (className === "8.02" || className === "8.011") {
        this.attemptToJoinClassId = classId;
        this.classSecurityPopup = true;
      } else {
        this.$router.push(`class/${classId}`);
      }
    },
    getMitClassRef (classId) { 
      return db.collection("classes").doc(classId); 
    },
    getBlackboardRef (explanationId) {
      return db.doc(`classes/${demoVideo.classId}/posts/${explanationId}/explanations/${explanationId}`);
    },
    async fetchClasses () {
      const ref = db.collection("classes");
      this.schoolClasses = await this.$_getCollection(ref);
    },
    enrollInClass ({ name, id }) {    
      if (this.user.enrolledClasses) {
        for (const classObj of this.user.enrolledClasses) {
          if (classObj.id === id) return; 
        }
      }
      const classSetting = { id, name, notifFrequency: NotifFrequency.ALWAYS };
      db.collection("users").doc(this.user.uid).update({
        enrolledClasses: firebase.firestore.FieldValue.arrayUnion(classSetting)
      });
    },
    async updateSettings (payload) {
      this.userRef.update({ enrolledClasses: payload })
    },
    async createClass ({ "class name": name, "class description": description }) {
      this.fetchClasses();
      for (const c of this.schoolClasses) {
        if (c.name === name) { return; } 
      }
      const classDoc = await db.collection("classes").add({
        name,
        description: description || "No description yet",
      });
      await this.userRef.update({
        enrolledClasses: firebase.firestore.FieldValue.arrayUnion({
          id: classDoc.id,
          name,
          notifFrequency: NotifFrequency.ALWAYS
        })
      })
      this.fetchClasses();
    },
    logIn ({ email, password }) {
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then((user) => {
          this.$store.dispatch("fetchUser", user);
          this.$root.$emit("show-snackbar", this.welcomeMessage);
        })
        .catch((error) => this.$root.$emit("show-snackbar", error.message));
    },
    signUp ({ "first name": firstName, "last name": lastName, email, password }) {
      if (!firstName || !lastName) { 
        this.$root.$emit(
          "show-snackbar", 
          "Error: don't forget to enter your first name and last name!"
        );
        return;
      }
      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(async (result) => {
          this.$root.$emit("show-snackbar", this.welcomeMessage);
          this.createAccount({ ...result.user, firstName, lastName })
        })
        .catch((error) => this.$root.$emit("show-snackbar", error.message));
    },
    createAccount ({ uid, email, firstName, lastName }) {
      function getRandomColor () {
        const letters = '0123456789ABCDEF'
        let color = '#'
        for (let i = 0; i < 6; i++) {
          color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
      }
      const color = getRandomColor();
      const enrolledClasses = [];
      const newUser = { uid, email, firstName, lastName, color, enrolledClasses };
      db.collection("users").doc(uid).set(newUser);
    },
    signOut () { 
      firebase.auth().signOut(); 
    },
    logoVisibility () {
      const hero_pos = document.querySelector(".central-title").getBoundingClientRect().top;
      if (hero_pos < 0) {
        document.getElementById("home-page").classList.add("scrolled");
      } else {
        document.getElementById("home-page").classList.remove("scrolled");
      }
    }
  }
};
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.7s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
#home-page .app-banner {
  border-bottom: none !important;
}
.hero-img {
  max-width: 20%;
  width: 90px;
}
.central-title h1 {
  font-size: 3em;
  font-weight: 600;
  font-family: "Raleway", sans-serif;
  text-decoration: underline;
  text-decoration-color: #eee;
}

@media (max-width: 400px) {
  .central-title h1 {
    font-size: 2.5em;
  }
}

#home-page .app-banner .home-logo {
  display: none;
}
#home-page.scrolled .app-banner .home-logo {
  display: unset;
}

.enrolled-classes .v-card__title {
  word-break: unset;
  font-size: 1.1em;
}

/* latin-ext */
@font-face {
  font-family: 'Raleway';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: local('Raleway SemiBold'), local('Raleway-SemiBold'), url(https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwPIsWqhPAMif.woff2) format('woff2');
  unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Raleway';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: local('Raleway SemiBold'), local('Raleway-SemiBold'), url(https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwPIsWqZPAA.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
</style>