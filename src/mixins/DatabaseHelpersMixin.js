import firebase from "firebase/app";
import "firebase/storage";

// Every CRUD operation has explicit error handling without making the codebase verbose
export default {
  methods: {
    async $_getDoc (ref) {
      return new Promise(async (resolve, reject) => {
        try {
          const doc = await ref.get();
          if (!doc.exists) {
            this.$root.$emit("show-snackbar", `Error: data doesn't exist for path = ${ref.path}`);
            reject();
          } else { resolve({ "id": doc.id, "ref": doc.ref.path, ...doc.data() }); } 
        } catch (error) {
          this.$root.$emit("show-snackbar", error.message);
          reject("Error: cannot fetch doc");
        }
      });
    },
    async $_getCollection (ref) {
      return new Promise(async (resolve, reject) => {
        try {
          const results = [];
          const collectionSnapshot = await ref.get();
          collectionSnapshot.forEach(doc => {
            results.push({ "id": doc.id, "ref": doc.ref.path, ...doc.data() });
          });
          resolve(results);
        } catch (error) {
          this.$root.$emit("show-snackbar", error.message);
          reject();
        }
      });
    },
    async $_listenToDoc (ref, obj, val) {
      return new Promise(async (resolve) => {
        try {
          const unsubscribeListener = ref.onSnapshot((doc) => { // onSnapshot does NOT return a promise
            obj[val] = { "id": doc.id, "ref": doc.ref.path, ...doc.data(), }
            resolve(unsubscribeListener);
          });
        } catch (error) {
          this.$root.$emit("show-snackbar", error.message);
        } 
      });
    },
    async $_listenToCollection (ref, obj, val) {
      return new Promise(async (resolve) => {
        try {
          const unsubscribeListener = ref.onSnapshot(querySnapshot => { // onSnapshot does NOT return a promise
            const resultDocs = [];
            querySnapshot.forEach((doc) => { 
              resultDocs.push({...doc.data(), "id": doc.id, "ref": doc.ref.path })
            });
            obj[val] = resultDocs;
            resolve(unsubscribeListener);
          });
        } catch (error) {
          this.$root.$emit("show-snackbar", error.message);
        } 
      });
    },
    $_saveToStorage (path, blob, showProgress = false) {
      return new Promise((resolve, reject) => {
        try {
          const storageRef = firebase.storage().ref();
          const ref = storageRef.child(path);
          const uploadTask = ref.put(blob);
          let uploadTimeout = null;
          uploadTask.on(firebase.storage.TaskEvent.STATE_CHANGED,
            (snapshot) => {
              // TODO: refactor
              if (showProgress) {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                this.uploadProgress = progress.toFixed(2);
                const secondInMilliseconds = 1000;
                clearInterval(uploadTimeout);
                if (this.uploadProgress !== "100.00") {
                  uploadTimeout = setTimeout(() => { 
                    this.messageToUser = "Failing to upload for some reason...try again.";
                    this.isUploadingPost = false; 
                  }, 
                  10 * secondInMilliseconds);
                }
              }
            },
            (error) => { 
              console.log("Error while uploading: ", error);
            },
            async () => {
              const downloadUrl = await uploadTask.snapshot.ref.getDownloadURL();
              resolve(downloadUrl);
            }
          );
        } catch (error) {
          console.log("Error initiating the upload =", error);
          this.$root.$emit("snow-snackbar", error.message);
          throw new Error(error);
        }
      });
    },
    $_getBlobFromStorage (downloadUrl) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "blob";
        xhr.onload = () => {
          try {
            const blob = xhr.response;
            resolve(blob);
          } catch (error) {
            reject(`Error downloading blob from Firebase storage: ${error}`);
          }
        }
        xhr.open('GET', downloadUrl);
        xhr.send();
      });
    }
  }
};