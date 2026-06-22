const menuButton = document.querySelector(".menu-button");
const menuPanel = document.querySelector(".menu-panel");

if (menuButton && menuPanel) {
  menuButton.addEventListener("click", () => {
    const isExpanded = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isExpanded));
    menuPanel.hidden = isExpanded;
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-wrap")) {
      menuButton.setAttribute("aria-expanded", "false");
      menuPanel.hidden = true;
    }
  });
}
