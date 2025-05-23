
<h1 align="center">🚥 WLED 2D Matrix GIF player 🚥</h1>

<p align="center">A tool to send and play GIFs on your WLED-based LED 2D matrix
  <br />
  <br />
  <a href="">Go to the app</a>
  <br />
  <a href="https://github.com/javiink/wled-gifplayer/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
  ·
  <a href="https://github.com/javiink/wled-gifplayer/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
</p>
<p align="center">
  <a href="https://github.com/Javiink/wled-gifplayer/actions"><img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/javiink/wled-gifplayer/build-release.yml"></a>
  <img alt="GitHub package.json version" src="https://img.shields.io/github/package-json/v/javiink/wled-gifplayer">
  <img alt="GitHub License" src="https://img.shields.io/github/license/javiink/wled-gifplayer">
</p>

## 🚀 Usage

Go to <a href="">the application page</a> and set up your device's IP address in the ⚙️ Settings button. Then you can play any GIF you like!

> [!IMPORTANT]  
> Your device needs to run WLED v0.16.0+ to be able to play GIFs with this tool.

> [!WARNING]
> You may need to disable "mixed-content" protection in your browser for this app to work. You can do this accessing to the site settings and allowing "Insecure content". In Chrome: Address bar > left site-settings icon > Site settings > Insecure content > Allow.
>
> *Why?* This is a safety protection feature that most browsers implements. As you are loading this application from a secure HTTPS context (GitHub Pages) and it is trying to reach your WLED device in an insecure HTTP context (it does not have a SSL certificate), the browser blocks the requests the application make to the device. Disabling this feature you are allowing the application to reach your device. *You could also setup a local proxy in your computer to make requests to the proxy and mask them, or download this repo, build it yourself and host it in your computer.*

## ✌️ Contributing

Contributions this project are always welcome!

If you want to contribute to the application, follow the steps below. When you are finished, please create a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feat-newFeature`)
3. Commit your Changes (`git commit -m 'Add some new feature'`)
4. Push to the Branch (`git push origin feat-newFeature`)
5. Open a Pull Request

If you don't know how to program, you can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! 🌟💖

## ⚙️ Roadmap

- [x] Delete old GIF from WLED to save space
- [x] Add favorites management
- [ ] Playback controls (pause/play/stop, turn off, brightness...)
- [ ] Ability to create playlists
- [ ] Ability to filter by predefined tags

## 💡 Inspiration

This project is heavily inpired in <a href="https://github.com/Manut38/WLED-GifPlayer-html">WLED-GifPlayer-html</a> from Manut38. If you only want to upload and play your own GIFs, please use that tool.

Of course, thanks to Aircookie and the WLED contributors for creating such an awesome tool. ❣️

## ⚖️ License

This project is [GNU licensed](LICENSE).
