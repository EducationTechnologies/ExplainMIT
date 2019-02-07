import Vue from 'vue'
import './plugins/vuetify'
import App from './App.vue'
import router from './router'
import store from './store'
// import './notifications'
import firebase from 'firebase/app'
import 'firebase/auth'
import VueFirestore from 'vue-firestore'
import VueChatScroll from 'vue-chat-scroll'
import VuePlyr from 'vue-plyr'
import 'vue-plyr/dist/vue-plyr.css'
import Clipboard from 'v-clipboard'

// plugins 
Vue.use(VueChatScroll)
Vue.use(VueFirestore)
Vue.use(VuePlyr)
Vue.use(Clipboard)

Vue.config.productionTip = false

firebase.auth().signInAnonymously()

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    console.log('user is logged in')
    store.dispatch('handleUserLogic', user)
  } else {
    console.log('user not logged in')
    // necessary for detecting when the user logs out
    store.commit('SET_USER', null)
  }
})

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
