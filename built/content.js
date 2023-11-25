// script.js
// Arrays of jokes
var jokes = [
    "Why do programmers always mix up Christmas and Halloween? Because Oct 31 == Dec 25.",
    "Why was the math book sad? Because it had too many problems.",
    "I'm reading a book on anti-gravity. It's impossible to put down!",
    "Why did the mathematician throw his clock out the window? He wanted to see time fly.",
    "Why did the computer catch a cold? Because it had too many windows open.",
];
var scientificQuotes = [
    "Science is the poetry of reality. - Richard Dawkins",
    "The good thing about science is that it's true whether or not you believe in it. - Neil deGrasse Tyson",
    "In science, there are no shortcuts to truth. - Carl Sagan",
    "Science is not only a disciple of reason but, also, one of romance and passion. - Stephen Hawking",
    "Science knows no country because knowledge belongs to humanity, and is the torch which illuminates the world. - Louis Pasteur",
    "Science is simply the word we use to describe a method of organizing our curiosity. - Tim Minchin",
    "The important thing is not to stop questioning. - Albert Einstein",
    "We are all connected; To each other, biologically. To the earth, chemically. To the rest of the universe atomically. - Neil deGrasse Tyson",
    "The more I learn, the more I realize how much I don't know. - Albert Einstein",
];
// Function to get a random joke
function getRandomJoke() {
    var randomIndex = Math.floor(Math.random() * jokes.length);
    return jokes[randomIndex];
}
function getQuotes() {
    var randomIndex = Math.floor(Math.random() * scientificQuotes.length);
    return scientificQuotes[randomIndex];
}
// Arrays of blocked site messages
var blockedMessages = [
    "Oops! The site you wanted to open is blocked.",
    "Sorry, access to the requested site is restricted, but I have a quote for you: " + getQuotes(),
    "This site is blocked, but here's a joke instead: " + getRandomJoke(),
    "Blocked! But don't worry, I've got a joke for you. " + getRandomJoke(),
    "The website is under construction, but our humor isn't: " + getRandomJoke(),
];
// Randomly select a blocked site message
var randomIndex = Math.floor(Math.random() * blockedMessages.length);
var message = blockedMessages[randomIndex];
// Display the message in the center of the screen
var messageDiv = document.getElementById("message");
messageDiv.innerText = message;
