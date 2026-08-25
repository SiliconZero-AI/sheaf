Windows only. See [CHANGELOG.md](https://github.com/SiliconZero-AI/sheaf/blob/main/CHANGELOG.md) for what changed.

## Install

Download `{{INSTALLER}}` below and run it. Installing over an older version keeps your settings and your files.

This build is **not code-signed yet**, so Windows SmartScreen shows *"Windows protected your PC — Unknown publisher"* the first time you run it. Choose **More info → Run anyway**.

首次运行时 Windows 会提示「未知发布者」，点**更多信息 → 仍要运行**即可。安装包尚未进行代码签名。

## Verify the download

SHA-256 of `{{INSTALLER}}`:

```
{{SHA256}}
```

```powershell
Get-FileHash .\{{INSTALLER}} -Algorithm SHA256
```
