// Mobile Menu Toggle
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });

    // Close menu when clicking on a link
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            hamburger.classList.remove('active');
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            navMenu.classList.remove('active');
            hamburger.classList.remove('active');
        }
    });
}

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Form Handling with Netlify Forms
// Netlify Forms will handle submission automatically, but we add client-side validation and success handling

// Function to show success message
function showSuccessMessage(form, message) {
    // Hide the form
    form.style.display = 'none';
    
    // Create success message element
    const successDiv = document.createElement('div');
    successDiv.className = 'form-success';
    successDiv.style.cssText = `
        padding: 2rem;
        background: #d4edda;
        border: 1px solid #c3e6cb;
        border-radius: 8px;
        color: #155724;
        text-align: center;
        margin: 2rem 0;
    `;
    successDiv.innerHTML = `
        <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; color: #28a745;"></i>
        <h3 style="margin-bottom: 0.5rem; color: #155724;">${message}</h3>
        <p style="color: #155724; margin: 0;">We'll get back to you soon!</p>
    `;
    
    // Insert success message before the form's parent
    form.parentNode.insertBefore(successDiv, form);
    
    // Scroll to success message
    successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        try {
            const formData = new FormData(contactForm);
            // Encode form data for Netlify Forms
            const encodedData = new URLSearchParams(formData).toString();
            
            const response = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: encodedData
            });
            
            // Check if response is ok or if it's a redirect (Netlify returns 200 or redirects)
            if (response.ok || response.status === 200 || response.redirected) {
                showSuccessMessage(contactForm, 'Thank you! Your message has been sent successfully.');
            } else {
                throw new Error('Form submission failed');
            }
        } catch (error) {
            console.error('Form submission error:', error);
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            alert('There was an error sending your message. Please try again or contact us directly at support@pbookspro.com');
        }
    });
}

const demoForm = document.getElementById('demoForm');
if (demoForm) {
    demoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = demoForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        
        try {
            const formData = new FormData(demoForm);
            const encodedData = new URLSearchParams(formData).toString();
            
            const response = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: encodedData
            });
            
            if (response.ok || response.status === 200 || response.redirected) {
                showSuccessMessage(demoForm, 'Thank you! Your demo request has been received. We\'ll contact you within 24 hours to schedule your demo.');
            } else {
                throw new Error('Form submission failed');
            }
        } catch (error) {
            console.error('Form submission error:', error);
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            alert('There was an error submitting your request. Please try again or contact us directly at support@pbookspro.com');
        }
    });
}

const downloadForm = document.getElementById('downloadForm');
if (downloadForm) {
    downloadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = downloadForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        submitBtn.disabled = true;
        
        try {
            const formData = new FormData(downloadForm);
            const encodedData = new URLSearchParams(formData).toString();
            
            const response = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: encodedData
            });
            
            if (response.ok || response.status === 200 || response.redirected) {
                // Show success message with application link
                downloadForm.style.display = 'none';
                
                const successDiv = document.createElement('div');
                successDiv.className = 'form-success';
                successDiv.style.cssText = `
                    padding: 2rem;
                    background: #d4edda;
                    border: 1px solid #c3e6cb;
                    border-radius: 8px;
                    color: #155724;
                    text-align: center;
                    margin: 2rem 0;
                `;
                successDiv.innerHTML = `
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; color: #28a745;"></i>
                    <h3 style="margin-bottom: 1rem; color: #155724;">Thank you! Your trial signup was successful.</h3>
                    <p style="color: #155724; margin-bottom: 1.5rem;">You can now access PBooksPro online. Click the button below to get started!</p>
                    <a href="https://app.pbookspro.com/" target="_blank" class="btn btn-primary btn-large" style="display: inline-block; text-decoration: none; margin-top: 1rem;">
                        <i class="fas fa-external-link-alt"></i> Access PBooksPro Application
                    </a>
                    <p style="color: #155724; margin-top: 1rem; font-size: 0.9rem;">Bookmark this link for easy access: <a href="https://app.pbookspro.com/" target="_blank" style="color: #155724; text-decoration: underline;">https://app.pbookspro.com/</a></p>
                `;
                
                downloadForm.parentNode.insertBefore(successDiv, downloadForm);
                successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                throw new Error('Form submission failed');
            }
        } catch (error) {
            console.error('Form submission error:', error);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            alert('There was an error processing your request. Please try again or contact us directly at support@pbookspro.com');
        }
    });
}

// Newsletter Form
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
        const submitBtn = newsletterForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Subscribing...';
        submitBtn.disabled = true;
        
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }, 2000);
    });
}

// Scroll to Top Button (optional)
let scrollToTopBtn = document.createElement('button');
scrollToTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
scrollToTopBtn.className = 'scroll-to-top';
scrollToTopBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    transition: all 0.3s;
`;

document.body.appendChild(scrollToTopBtn);

window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.style.display = 'flex';
    } else {
        scrollToTopBtn.style.display = 'none';
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Add hover effect to scroll button
scrollToTopBtn.addEventListener('mouseenter', () => {
    scrollToTopBtn.style.transform = 'translateY(-5px)';
    scrollToTopBtn.style.background = 'var(--primary-dark)';
});

scrollToTopBtn.addEventListener('mouseleave', () => {
    scrollToTopBtn.style.transform = 'translateY(0)';
    scrollToTopBtn.style.background = 'var(--primary-color)';
});

// Animate on Scroll (simple version)
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.querySelectorAll('.value-card, .feature-item, .blog-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Add active class to current page in navigation
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-menu a').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
        link.classList.add('active');
    }
});

// Form Validation Enhancement
const forms = document.querySelectorAll('form');
forms.forEach(form => {
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    
    inputs.forEach(input => {
        input.addEventListener('blur', () => {
            if (!input.value.trim()) {
                input.style.borderColor = 'var(--danger-color)';
            } else {
                input.style.borderColor = 'var(--border-color)';
            }
        });
        
        input.addEventListener('input', () => {
            if (input.value.trim()) {
                input.style.borderColor = 'var(--success-color)';
            }
        });
    });
});

// Price Calculator (if needed in future)
function calculateSavings() {
    // This can be expanded for ROI calculator
    const separateSoftware = 900000;
    const myProjectsPro = 85000;
    const savings = separateSoftware - myProjectsPro;
    return savings;
}

// Console log for debugging
console.log('PBooksPro website loaded successfully!');

