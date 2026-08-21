# Code signing policy

## Current status

Sheaf v0.1.0 is unsigned. This policy describes the controls that will apply if Sheaf is accepted into the SignPath Foundation open-source program. Signed releases will be clearly identified on the GitHub Release page; an unsigned release will never be presented as signed.

Required attribution after acceptance: **Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).**

## Project and artifact scope

- Source repository: <https://github.com/SiliconZero-AI/sheaf>
- Release page: <https://github.com/SiliconZero-AI/sheaf/releases>
- Artifacts covered by this policy: the Sheaf Windows executable and NSIS installer built from this repository
- Local or manually modified binaries are not eligible for signing

## Team roles

- Committer and reviewer: [Mika / SiliconZero-AI](https://github.com/SiliconZero-AI)
- Signing approver: [Mika / SiliconZero-AI](https://github.com/SiliconZero-AI)

Changes proposed by contributors without commit access must be reviewed before merging. Every signing request must receive manual approval from the signing approver.

## Build and signing controls

- Release artifacts are built from a public `v*` tag by a GitHub-hosted Windows runner.
- Dependency lockfiles are committed and enforced during the build.
- The unsigned build is uploaded as an immutable GitHub Actions artifact before any signing request.
- Once SignPath is integrated, origin verification must tie every signed artifact to this repository, workflow run, commit, and tag.
- Signing credentials and private keys must never be stored in this repository. SignPath Foundation signing keys remain protected by its managed HSM.
- The product name and version embedded in signed binaries must match the repository and release tag.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

Sheaf reads and writes only files and folders the user chooses to open. See [SECURITY.md](SECURITY.md) for the security model and vulnerability-reporting process.

---

# 代码签名政策

Sheaf v0.1.0 当前尚未签名。本政策规定 Sheaf 通过 SignPath Foundation 开源项目审核后采用的构建、审批与签名规则。只有 GitHub Release 页面明确标注为已签名的版本，才属于签名版本。

- 仅签名由本仓库公开 `v*` 标签触发、在 GitHub 托管的 Windows runner 上生成的 Sheaf 主程序与 NSIS 安装包。
- 本地构建、手工修改或无法追溯到公开源码的二进制文件不得签名。
- 外部贡献必须经过维护者审查；每次签名请求必须由签名批准人手动批准。
- 签名密钥不得进入仓库；产物必须能追溯到仓库、工作流、提交与标签。
- 除非用户或安装/运行程序的人主动要求，Sheaf 不会向任何联网系统传输信息。
