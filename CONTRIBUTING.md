Contribution Guidelines
=======================
Great to have you here. Whether it's improving documentation, adding a new component, or suggesting an issue that will help us improve, all contributions are welcome!

- [Contribution Expectations](#Contribution-Expectations)
- [Contribution Process](#Contribution-Process)
- [After Contribution is Merged](#After-Contribution-is-Merged)
- [Contact Information](#Contact-Information)

## Contribution Expectations

#### Adding Functionality or Reporting Bugs

* You can look through the existing features/ bugs in the issues, if not please create a new issue.
* Please note we have a code of conduct, please follow it in all your interactions with the project.

#### Code Quality Expectations
- Tests: All new methods should have unit tests
- Coverage: Ensure that code coverage does not fall below 80%
- Documentation: Code should be well-documented. What code is doing should be self-explanatory based on coding conventions. Why code is doing something should be explained:
    * `pom.xml` should have comments
    * Unit tests should have comments and failure messages
    * Integration tests should have comments and failure messages
- Code Style: We try to follow [Google's Coding Standards](https://google.github.io/styleguide/tsguide.html). It's easiest to format based on existing code you see. We don't enforce this; it's just a guideline

#### SLAs
The team that owns this repo is expected to practice the following:

>The pull request review SLA is 20 days
- Address any incoming PRs for contributions
- Prioritize feature requests if handled by the team itself
- Support the contributor through code guidance and contribution recognition



## Contribution Process
**All contributions should be done through a fork**

1. Once the alignment is reached. Fork and Clone. From the GitHub UI, fork the project into your user space or another organization.
2. Create a branch in your forked repo.
3. Make your changes, including documentation. Writing good commit logs is important.
   ```text
   A commit log should describe what changed and why. 
   Make sure that the commit message contains the Issue number. 
   ```
4. **Test**. Bug fixes and features **should come with tests** and coverage should meet or exceed 80%. Make sure all tests pass. Please do not submit patches that fail this check.

5. Push your changes to your fork's branch. Use `git rebase` (not `git merge`) to sync your work from time to time.
6. In GitHub, create a Pull Request to the upstream repository. On your forked repo, click the 'Pull Request' button and fill out the form.
7. Making a PR will automatically trigger a series of checks against your changes.
8. The team will reach out if they need more information or to make suggestions.


[//]: # (after pr)

## After Contribution is Merged

Once the PR is good to go, the team will merge it, and you'll be credited as a contributor! Reach out to the team to follow their release cycle. These key questions can help you know what to expect:

>- Are there ownership expectations in preprod/prod for a period of time?
>- When can a contributor expect to see merged code built and deployed to preprod and prod?
>- How can a contributor validate their code changes after changes have been deployed?


## Contact Information

* Need to get in contact with the team? The best people to start with are the project [code owners](./.github/CODEOWNERS).
