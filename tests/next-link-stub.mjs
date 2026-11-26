import {createElement} from "react";

export default function Link({href, className, children, ...rest}) {
    const ariaCurrent = rest["aria-current"];
    return createElement(
        "a",
        {
            href,
            ...(ariaCurrent ? {"aria-current": ariaCurrent} : {}),
            className,
        },
        children,
    );
}
