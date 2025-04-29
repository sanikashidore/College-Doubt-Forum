// Global variables
let currentFilter = 'all';
let imageUrl = null;
let questionModalInstance = null;

// Initialize Firebase only once
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log("Auth persistence enabled");
  })
  .catch((error) => {
    console.error("Auth persistence error:", error);
  });

let currentUser;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get current user
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            currentUser = user;
            // Load questions when user is authenticated
            loadQuestions(CURRENT_SUBJECT);
        } else {
            window.location.href = '../login.html';
        }
    });

    // Initialize question modal
    const questionModal = document.getElementById('questionModal');
    if (questionModal) {
        questionModalInstance = new bootstrap.Modal(questionModal);
        
        // Handle question submission
        document.getElementById('submit-question').addEventListener('click', submitQuestion);
        
        // Handle image upload preview
        const imageInput = document.getElementById('question-image');
        if (imageInput) {
            imageInput.addEventListener('change', previewImage);
        }
    }

    // Set up filter buttons
    setupFilters();
});

// Function to load questions based on subject
function loadQuestions(subject) {
    const questionsContainer = document.getElementById('questions-container');
    if (!questionsContainer) return;
    
    questionsContainer.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Loading questions...</p>
        </div>
    `;
    
    // Make sure currentUser is available before proceeding
    if (!currentUser) {
        setTimeout(() => loadQuestions(subject), 500);
        return;
    }
    
    let query = db.collection('questions').where('subject', '==', subject);
    
    // Apply filters
    if (currentFilter === 'unanswered') {
        query = query.where('answerCount', '==', 0);
    } else if (currentFilter === 'my-questions') {
        query = query.where('authorId', '==', currentUser.uid);
    }
    
    // Order by votes and creation date
    query.orderBy('votes', 'desc')
        .orderBy('createdAt', 'desc')
        .get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                questionsContainer.innerHTML = `
                    <div class="text-center py-5">
                        <p>No questions found. Be the first to ask a question!</p>
                    </div>
                `;
                return;
            }
            
            questionsContainer.innerHTML = '';
            querySnapshot.forEach((doc) => {
                const questionData = doc.data();
                displayQuestion(doc.id, questionData);
            });
        })
        .catch((error) => {
            console.error("Error loading questions: ", error);
            questionsContainer.innerHTML = `
                <div class="alert alert-danger">
                    Failed to load questions. Please try again later.
                </div>
            `;
        });
}

// Function to display a question
function displayQuestion(questionId, questionData) {
    const questionsContainer = document.getElementById('questions-container');
    const template = document.getElementById('question-template');
    
    if (!template || !questionsContainer) return;
    
    // Clone the template
    const questionElement = template.content.cloneNode(true);
    const questionCard = questionElement.querySelector('.question-card');
    
    // Set question ID as data attribute
    questionCard.dataset.id = questionId;
    
    // Fill in question details
    questionCard.querySelector('.question-title').textContent = questionData.title;
    questionCard.querySelector('.question-content').textContent = questionData.content;
    
    // Handle question image if exists
    if (questionData.imageUrl) {
        const imgContainer = questionCard.querySelector('.question-image-container');
        const img = document.createElement('img');
        img.src = questionData.imageUrl;
        img.alt = "Question image";
        img.className = "img-fluid rounded";
        img.style.maxHeight = "300px";
        imgContainer.appendChild(img);
    }
    
    // Add tags if any
    if (questionData.tags && questionData.tags.length > 0) {
        const tagsContainer = questionCard.querySelector('.question-tags');
        tagsContainer.innerHTML = ''; // Clear existing tags
        questionData.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'badge bg-secondary me-1';
            tagSpan.textContent = tag;
            tagsContainer.appendChild(tagSpan);
        });
    }
    
    // Set author and date
    questionCard.querySelector('.question-author').textContent = questionData.authorName || questionData.authorEmail || 'Anonymous';
    
    const date = questionData.createdAt ? new Date(questionData.createdAt.toDate()) : new Date();
    questionCard.querySelector('.question-date').textContent = date.toLocaleDateString();
    
    // Set vote count
    questionCard.querySelector('.vote-count').textContent = questionData.votes || 0;
    
    // Set up voting buttons
    setupVoting(questionCard, questionId, 'question');
    
    // Handle answers
    const answersCount = questionCard.querySelector('.answers-count');
    const answerCount = questionData.answerCount || 0;
    answersCount.textContent = answerCount === 1 ? '1 Answer' : `${answerCount} Answers`;
    
    // Load answers if any
    if (answerCount > 0) {
        loadAnswers(questionId, questionCard.querySelector('.answers-container'));
    }
    
    // Set up answer form
    setupAnswerForm(questionCard.querySelector('.answer-form'), questionId);
    
    // Add to container
    questionsContainer.appendChild(questionElement);
}

// Function to load answers for a question
function loadAnswers(questionId, container) {
    if (!currentUser) {
        console.error("User not authenticated");
        container.innerHTML = '<div class="alert alert-warning">Please sign in to view answers</div>';
        return;
    }
    
    console.log("Loading answers for question:", questionId);
    
    // Show loading indicator
    container.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>';
    
    // Get answers directly with a one-time get() operation
    db.collection('questions').doc(questionId)
        .collection('answers')
        .orderBy('votes', 'desc')
        .orderBy('createdAt', 'asc')
        .get()
        .then(snapshot => {
            console.log(`Got ${snapshot.size} answers for question ${questionId}`);
            
            // Clear container
            container.innerHTML = '';
            
            if (snapshot.empty) {
                container.innerHTML = '<p class="text-muted small py-2">No answers yet.</p>';
                return;
            }
            
            // Display each answer
            snapshot.forEach(doc => {
                const answerData = doc.data();
                displayAnswer(doc.id, answerData, container, questionId);
            });
        })
        .catch(error => {
            console.error("Error loading answers:", error);
            container.innerHTML = `
                <div class="alert alert-danger small">
                    Error loading answers: ${error.message}
                </div>
            `;
        });
}
// Function to display an answer
function displayAnswer(answerId, answerData, container, questionId) {
    console.log("Displaying answer:", answerId, "for question:", questionId);
    const template = document.getElementById('answer-template');
    
    if (!template || !container) return;
    
    // Clone the template
    const answerElement = template.content.cloneNode(true);
    const answerCard = answerElement.querySelector('.answer-card');
    
    // Set answer ID as data attribute
    answerCard.dataset.id = answerId;
    answerCard.dataset.questionId = questionId;
    
    // Fill in answer details
    answerCard.querySelector('.answer-content').textContent = answerData.content;
    
    // Handle answer image if exists
    if (answerData.imageUrl) {
        const imgContainer = answerCard.querySelector('.answer-image-container');
        const img = document.createElement('img');
        img.src = answerData.imageUrl;
        img.alt = "Answer image";
        img.className = "img-fluid rounded";
        img.style.maxHeight = "200px";
        imgContainer.appendChild(img);
    }
    
    // Set author and date
    answerCard.querySelector('.answer-author').textContent = answerData.authorName || answerData.authorEmail || 'Anonymous';
    
    const date = answerData.createdAt ? new Date(answerData.createdAt.toDate()) : new Date();
    answerCard.querySelector('.answer-date').textContent = date.toLocaleDateString();
    
    // Set vote count
    answerCard.querySelector('.vote-count').textContent = answerData.votes || 0;
    
    // Set up voting buttons
    setupVoting(answerCard, answerId, 'answer', questionId);
    
    // Add to container
    container.appendChild(answerElement);
}

// Function to upload image to ImgBB
async function uploadImageToImgBB(imageFile) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                resolve(result.data.url);
            } else {
                reject(new Error('Image upload failed'));
            }
        })
        .catch(error => {
            reject(error);
        });
    });
}

// Function to handle question submission
function submitQuestion() {
    const title = document.getElementById('question-title').value.trim();
    const content = document.getElementById('question-content').value.trim();
    const tagsInput = document.getElementById('question-tags').value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()) : [];
    
    // Validate inputs
    if (!title || !content) {
        alert('Please fill in all required fields.');
        return;
    }
    
    const questionData = {
        title: title,
        content: content,
        subject: CURRENT_SUBJECT, // This is defined in the HTML file
        tags: tags,
        authorId: currentUser.uid,
        authorEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        votes: 0,
        answerCount: 0
    };
    
    // Handle image upload if present
    const imageFile = document.getElementById('question-image').files[0];
    
    if (imageFile) {
        // Show progress indicator
        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        progressContainer.style.display = 'flex';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        
        // Use ImgBB for image upload
        uploadImageToImgBB(imageFile)
            .then(imageUrl => {
                progressBar.style.width = '100%';
                progressBar.textContent = '100%';
                questionData.imageUrl = imageUrl;
                submitQuestionToFirestore(questionData);
            })
            .catch(error => {
                console.error("Upload failed:", error);
                progressContainer.style.display = 'none';
                alert('Failed to upload image. Please try again.');
            });
    } else {
        // No image to upload
        submitQuestionToFirestore(questionData);
    }
}

// Function to submit question data to Firestore
function submitQuestionToFirestore(questionData) {
    db.collection('questions').add(questionData)
        .then(() => {
            // Reset form and close modal
            document.getElementById('question-form').reset();
            document.getElementById('image-preview').innerHTML = '';
            document.getElementById('upload-progress-container').style.display = 'none';
            
            if (questionModalInstance) {
                questionModalInstance.hide();
            }
            
            // Reload questions
            loadQuestions(CURRENT_SUBJECT);
        })
        .catch((error) => {
            console.error("Error adding question: ", error);
            alert('Failed to post question. Please try again later.');
        });
}

// Function to set up answer form submission
function setupAnswerForm(form, questionId) {
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const contentInput = form.querySelector('.answer-content');
        const content = contentInput.value.trim();
        
        if (!content) {
            alert('Please enter your answer.');
            return;
        }
        
        const answerData = {
            content: content,
            authorId: currentUser.uid,
            authorEmail: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            votes: 0
        };
        
        // Handle image upload if present
        const imageFile = form.querySelector('.answer-image').files[0];
        
        if (imageFile) {
            // Upload image to ImgBB
            uploadImageToImgBB(imageFile)
                .then(imageUrl => {
                    answerData.imageUrl = imageUrl;
                    submitAnswer(questionId, answerData, form);
                })
                .catch(error => {
                    console.error("Upload failed:", error);
                    alert('Failed to upload image. Please try again.');
                });
        } else {
            // No image to upload
            submitAnswer(questionId, answerData, form);
        }
    });
    
    // Handle image preview
    const imageInput = form.querySelector('.answer-image');
    const previewContainer = form.querySelector('.image-preview');
    
    if (imageInput && previewContainer) {
        imageInput.addEventListener('change', function() {
            previewContainer.innerHTML = '';
            
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = "Preview";
                    img.className = "img-fluid rounded mt-2";
                    img.style.maxHeight = "150px";
                    previewContainer.appendChild(img);
                }
                
                reader.readAsDataURL(this.files[0]);
            }
        });
    }
}

// Function to submit an answer
function submitAnswer(questionId, answerData, form) {
    // Add answer to Firestore
    db.collection('questions').doc(questionId)
        .collection('answers').add(answerData)
        .then(() => {
            // Update answer count
            db.collection('questions').doc(questionId).update({
                answerCount: firebase.firestore.FieldValue.increment(1)
            });
            
            // Reset form
            form.reset();
            form.querySelector('.image-preview').innerHTML = '';
            
            // Get the question card and manually reload answers
            const questionCard = form.closest('.question-card');
            const answersContainer = questionCard.querySelector('.answers-container');
            
            // Reload answers
            loadAnswers(questionId, answersContainer);
            
            // Update answers count
            const answersCount = questionCard.querySelector('.answers-count');
            const currentCount = parseInt(answersCount.textContent.split(' ')[0] || 0);
            const newCount = currentCount + 1;
            answersCount.textContent = newCount === 1 ? '1 Answer' : `${newCount} Answers`;
        })
        .catch((error) => {
            console.error("Error adding answer: ", error);
            alert('Failed to post answer. Please try again later.');
        });
}

// Function to set up voting
function setupVoting(element, id, type, questionId = null) {
    const upvoteBtn = element.querySelector('.vote-up');
    const downvoteBtn = element.querySelector('.vote-down');
    const voteCount = element.querySelector('.vote-count');
    
    if (!upvoteBtn || !downvoteBtn || !voteCount) return;
    
    // Check if user has already voted
    function checkUserVote() {
        const userId = currentUser.uid;
        let voteRef;
        
        if (type === 'question') {
            voteRef = db.collection('votes').doc(`${userId}_question_${id}`);
        } else {
            voteRef = db.collection('votes').doc(`${userId}_answer_${id}`);
        }
        
        return voteRef.get().then(doc => {
            if (doc.exists) {
                const voteData = doc.data();
                if (voteData.vote === 1) {
                    upvoteBtn.classList.add('text-success');
                } else if (voteData.vote === -1) {
                    downvoteBtn.classList.add('text-danger');
                }
                return voteData.vote;
            }
            return 0;
        });
    }
    
    // Handle upvote
    upvoteBtn.addEventListener('click', function() {
        if (!currentUser) return;
        
        checkUserVote().then(currentVote => {
            let newVote = 0;
            let voteDiff = 0;
            
            if (currentVote === 1) {
                // Cancel upvote
                newVote = 0;
                voteDiff = -1;
                upvoteBtn.classList.remove('text-success');
            } else {
                // Add upvote
                newVote = 1;
                voteDiff = currentVote === -1 ? 2 : 1;
                upvoteBtn.classList.add('text-success');
                downvoteBtn.classList.remove('text-danger');
            }
            
            updateVote(id, type, newVote, voteDiff, questionId);
            
            // Update UI immediately
            const currentCount = parseInt(voteCount.textContent || 0);
            voteCount.textContent = currentCount + voteDiff;
        });
    });
    
    // Handle downvote
    downvoteBtn.addEventListener('click', function() {
        if (!currentUser) return;
        
        checkUserVote().then(currentVote => {
            let newVote = 0;
            let voteDiff = 0;
            
            if (currentVote === -1) {
                // Cancel downvote
                newVote = 0;
                voteDiff = 1;
                downvoteBtn.classList.remove('text-danger');
            } else {
                // Add downvote
                newVote = -1;
                voteDiff = currentVote === 1 ? -2 : -1;
                downvoteBtn.classList.add('text-danger');
                upvoteBtn.classList.remove('text-success');
            }
            
            updateVote(id, type, newVote, voteDiff, questionId);
            
            // Update UI immediately
            const currentCount = parseInt(voteCount.textContent || 0);
            voteCount.textContent = currentCount + voteDiff;
        });
    });
    
    // Initial check for existing votes
    checkUserVote();
}

// Function to update vote in Firestore
function updateVote(id, type, vote, voteDiff, questionId) {
    const userId = currentUser.uid;
    const batch = db.batch();
    
    // Update vote record
    const voteRef = db.collection('votes').doc(`${userId}_${type}_${id}`);
    
    if (vote === 0) {
        // Delete vote record if cancelling vote
        batch.delete(voteRef);
    } else {
        // Create or update vote record
        batch.set(voteRef, {
            userId: userId,
            targetId: id,
            targetType: type,
            vote: vote,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    // Update vote count on question or answer
    let targetRef;
    if (type === 'question') {
        targetRef = db.collection('questions').doc(id);
    } else {
        targetRef = db.collection('questions').doc(questionId).collection('answers').doc(id);
    }
    
    batch.update(targetRef, {
        votes: firebase.firestore.FieldValue.increment(voteDiff)
    });
    
    // Commit batch
    return batch.commit().catch(error => {
        console.error("Error updating vote: ", error);
    });
}

// Function to preview image before upload
function previewImage() {
    const preview = document.getElementById('image-preview');
    const file = document.getElementById('question-image').files[0];
    
    if (!preview) return;
    
    preview.innerHTML = '';
    
    if (file) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = "Preview";
            img.className = "img-fluid rounded mt-2";
            img.style.maxHeight = "200px";
            preview.appendChild(img);
        }
        
        reader.readAsDataURL(file);
    }
}

// Function to set up filter buttons
function setupFilters() {
    const allBtn = document.getElementById('filter-all');
    const unansweredBtn = document.getElementById('filter-unanswered');
    const myQuestionsBtn = document.getElementById('filter-my-questions');
    
    if (!allBtn || !unansweredBtn || !myQuestionsBtn) return;
    
    allBtn.addEventListener('click', function() {
        if (currentFilter === 'all') return;
        
        currentFilter = 'all';
        updateFilterUI();
        loadQuestions(CURRENT_SUBJECT);
    });
    
    unansweredBtn.addEventListener('click', function() {
        if (currentFilter === 'unanswered') return;
        
        currentFilter = 'unanswered';
        updateFilterUI();
        loadQuestions(CURRENT_SUBJECT);
    });
    
    myQuestionsBtn.addEventListener('click', function() {
        if (currentFilter === 'my-questions') return;
        
        currentFilter = 'my-questions';
        updateFilterUI();
        loadQuestions(CURRENT_SUBJECT);
    });
}

// Function to update filter UI
function updateFilterUI() {
    const allBtn = document.getElementById('filter-all');
    const unansweredBtn = document.getElementById('filter-unanswered');
    const myQuestionsBtn = document.getElementById('filter-my-questions');
    
    if (!allBtn || !unansweredBtn || !myQuestionsBtn) return;
    
    allBtn.classList.remove('active');
    unansweredBtn.classList.remove('active');
    myQuestionsBtn.classList.remove('active');
    
    if (currentFilter === 'all') {
        allBtn.classList.add('active');
    } else if (currentFilter === 'unanswered') {
        unansweredBtn.classList.add('active');
    } else if (currentFilter === 'my-questions') {
        myQuestionsBtn.classList.add('active');
    }
}