function loadFooter() {
    const footerHTML = `
        <footer class="footer" style="margin-top: auto; padding: 20px; text-align: center; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; background: transparent; width: 100%;">
            <p>&copy; 2026 Synthesis Group HR Solutions. All rights reserved.</p>
        </footer>
    `;

    // Find the main-content area
    const mainContent = document.querySelector('.main-content');
    
    if (mainContent) {
        // Apply flexbox rules to make sure the footer sticks to the bottom
        mainContent.style.display = 'flex';
        mainContent.style.flexDirection = 'column';
        mainContent.style.minHeight = '100vh';

        // Insert the footer at the very end of the main-content div
        mainContent.insertAdjacentHTML('beforeend', footerHTML);
    } else {
        // Fallback just in case
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    }
}