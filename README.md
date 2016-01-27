# Groundwork Postgres
This is a starter project for Node and Postgres apps.

### Required
`brew install node`  
`brew install heroku-toolbelt`  
`npm install`   

### Deploy to Direct to Heroku
`heroku create siteName`  

Then commit, and then push it up!

`git add .`  
`git commit -m 'first commit'`  
`git push heroku master`  
`heroku open`  

### Clone, Clear and Push

Step 1: Clone
`git clone https://github.com/leylandjacob/groundwork-postgres.git folderName`  

Step 2: Remove History  

`rm -rf .git`  

Step 3: Initial Commit

`git init`  
`git add .`  
`git commit -m "Initial commit"`  

Step 4: Push to GitHub.

`git remote add origin <github-uri>`  
`git push -u --force origin master`  