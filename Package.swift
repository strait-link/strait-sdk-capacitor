// swift-tools-version: 5.9
import PackageDescription

// @straitlink/capacitor, iOS side: a thin Capacitor plugin over StraitSDK (Swift Package Manager).
let package = Package(
    name: "StraitlinkCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "StraitlinkCapacitor", targets: ["StraitPlugin"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // setEnabled (opt-out) is on strait-sdk-swift main (ca1b4c3, incl. the F7 clipboard fix), not in a tag yet: re-pin to the next
        // StraitSDK release tag (`from:`) before this package is released (ops/run-1105/sdk-release-plan.md).
        .package(url: "https://github.com/strait-link/strait-sdk-swift.git", revision: "ca1b4c36cee9bb7b22701d5f8d5907a55fc25513"),
    ],
    targets: [
        .target(
            name: "StraitPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "StraitSDK", package: "strait-sdk-swift"),
            ],
            path: "ios/Sources/StraitPlugin"
        ),
    ]
)
