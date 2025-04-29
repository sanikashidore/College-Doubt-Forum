// Handle login form submission
document.getElementById('login-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    // Simple validation
    if (!email || !password) {
        errorDiv.textContent = 'Please enter both email and password.';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Sign in with email and password
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Redirect to home page after successful login
            window.location.href = 'home.html';
        })
        .catch((error) => {
            // Handle errors
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
        });
});

// Handle signup form submission
document.getElementById('signup-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const errorDiv = document.getElementById('signup-error');
    
    // Simple validation
    if (!email || !password) {
        errorDiv.textContent = 'Please enter both email and password.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match.';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Create user with email and password
    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Redirect to home page after successful signup
            window.location.href = 'home.html';
        })
        .catch((error) => {
            // Handle errors
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
        });
});

// Check if URL has #signup hash and switch to signup tab
if (window.location.hash === '#signup') {
    const signupTab = document.getElementById('signup-tab');
    if (signupTab) {
        const tab = new bootstrap.Tab(signupTab);
        tab.show();
    }
}

// Check authentication state
firebase.auth().onAuthStateChanged(function(user) {
    // Redirect to login if trying to access protected pages
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.includes('login.html');
    const isHomePage = currentPath.includes('index.html') || currentPath.endsWith('/');
    const isProtectedPage = !isAuthPage && !isHomePage;
    
    if (!user && isProtectedPage) {
        window.location.href = '/pages/login.html';
    }
    
    // Redirect to home if already logged in and trying to access login page
    if (user && isAuthPage) {
        window.location.href = 'home.html';
    }
});